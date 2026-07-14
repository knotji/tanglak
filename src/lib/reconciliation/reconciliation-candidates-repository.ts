/**
 * Persistence for `reconciliation_candidates` -- mirrors the exact
 * mock/Supabase branching convention and idempotency-key dedupe pattern
 * used by src/lib/autopilot/autopilot-audit.ts. This is the only module
 * that reads/writes the table directly; callers (reconciliation-scan.ts,
 * tests) always go through these functions.
 *
 * PR A never deletes a candidate row -- `invalidateReconciliationCandidate`
 * is the only status-changing write this module exposes, and it only
 * ever moves a row to `invalidated`, never `confirmed`/`rejected` (those
 * are reserved for PR B's Review Inbox actions).
 *
 * Idempotency lifecycle: an idempotency key is a pure function of
 * (user_id, candidate_type, source_transaction_ids, related_debt_ids)
 * and never changes for as long as those ids exist -- but a candidate's
 * *evidence* can go stale and get `invalidated` while the same
 * transactions still exist (see reconciliation-invalidation.ts). To
 * allow a fresh, re-evaluated candidate to be created for that same id
 * pair after invalidation -- without ever deleting the old row, and
 * without ever allowing two *active* rows for the same key at once --
 * uniqueness is enforced only among non-invalidated ("active") rows:
 * see the migration's `reconciliation_candidates_user_idempotency_key_active_idx`
 * (a partial unique index, `where status <> 'invalidated'`) and
 * `findActiveReconciliationCandidateByIdempotencyKey` below. A given
 * idempotency key can therefore be shared by any number of historical
 * invalidated rows plus at most one active row at a time -- the full
 * lineage stays queryable and auditable via that shared key.
 */

import { isMockAuthEnabled } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMockState } from "@/lib/data/mock-store";
import { computeReconciliationIdempotencyKey } from "./reconciliation-idempotency";
import {
  RECONCILIATION_CANDIDATE_SCHEMA_VERSION,
  type ReconciliationCandidateDraft,
  type ReconciliationCandidateRecord,
  type ReconciliationCandidateStatus,
  type ReconciliationCandidateType,
  type ReconciliationConfidence,
  type ReconciliationEvidence,
  type ReconciliationPolicyOutcome,
  type ReconciliationTransactionSnapshot,
} from "./reconciliation-types";

function assertOwner(userId: string, ownerId: string) {
  if (userId !== ownerId) throw new Error("Cannot access another user's data");
}

const RECONCILIATION_CANDIDATE_COLUMNS =
  "id, user_id, candidate_type, status, confidence, policy_outcome, requires_review, source_transaction_ids, related_debt_ids, evidence, evidence_snapshots, idempotency_key, schema_version, invalidated_at, invalidation_reason, created_at, updated_at";

const INVALIDATABLE_RECONCILIATION_STATUSES: readonly ReconciliationCandidateStatus[] = ["proposed", "needs_review"];

function isInvalidatableReconciliationStatus(status: ReconciliationCandidateStatus) {
  return INVALIDATABLE_RECONCILIATION_STATUSES.includes(status);
}

type ReconciliationCandidateRow = {
  id: string;
  user_id: string;
  candidate_type: ReconciliationCandidateType;
  status: ReconciliationCandidateStatus;
  confidence: ReconciliationConfidence;
  policy_outcome: ReconciliationPolicyOutcome | null;
  requires_review: boolean;
  source_transaction_ids: string[];
  related_debt_ids: string[] | null;
  evidence: unknown;
  evidence_snapshots: unknown;
  idempotency_key: string;
  schema_version: number;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  created_at: string;
  updated_at: string;
};

function mapReconciliationCandidateRow(row: ReconciliationCandidateRow): ReconciliationCandidateRecord {
  return {
    id: row.id,
    userId: row.user_id,
    candidateType: row.candidate_type,
    status: row.status,
    confidence: row.confidence,
    policyOutcome: row.policy_outcome ?? undefined,
    requiresReview: row.requires_review,
    sourceTransactionIds: row.source_transaction_ids,
    relatedDebtIds: row.related_debt_ids ?? undefined,
    evidence: (row.evidence as ReconciliationEvidence[] | null) ?? [],
    evidenceSnapshots: (row.evidence_snapshots as ReconciliationTransactionSnapshot[] | null) ?? [],
    idempotencyKey: row.idempotency_key,
    schemaVersion: row.schema_version,
    invalidatedAt: row.invalidated_at ?? undefined,
    invalidationReason: row.invalidation_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreateReconciliationCandidateInput = {
  draft: ReconciliationCandidateDraft;
  policyOutcome: ReconciliationPolicyOutcome;
  requiresReview: boolean;
};

export type CreateReconciliationCandidateResult = {
  record: ReconciliationCandidateRecord;
  /** False when an existing row (same idempotency key) was returned instead of a new insert -- the caller's signal that this was a no-op repeat. */
  created: boolean;
};

/**
 * Idempotently creates (or returns the existing *active* row) for a
 * draft. Computes the canonical idempotency key from the draft itself
 * (never trusts a caller-supplied key), pre-checks for an existing
 * *active* (non-invalidated) row with that key (fast path for a plain
 * repeated scan), and falls back to re-reading the active row on a
 * unique-violation (`23505`, the DB-backed half of idempotency for a
 * genuine concurrent-insert race) -- exactly mirroring
 * `createAutopilotActionRecord`'s pattern.
 *
 * Deliberately checks *active* rows only, not "any row with this key":
 * once every prior row for a key has been invalidated (see
 * reconciliation-invalidation.ts), this must be able to insert a fresh
 * active row reusing the same key -- see the migration's
 * `reconciliation_candidates_user_idempotency_key_active_idx` (a partial
 * unique index scoped to `status <> 'invalidated'`) for the DB-level
 * half of this design.
 */
export async function createReconciliationCandidate(
  input: CreateReconciliationCandidateInput,
): Promise<CreateReconciliationCandidateResult> {
  const { draft } = input;
  const idempotencyKey = computeReconciliationIdempotencyKey({
    userId: draft.userId,
    candidateType: draft.candidateType,
    sourceTransactionIds: draft.sourceTransactionIds,
    relatedDebtIds: draft.relatedDebtIds,
  });

  const existing = await findActiveReconciliationCandidateByIdempotencyKey(draft.userId, idempotencyKey);
  if (existing) return { record: existing, created: false };

  const status: ReconciliationCandidateStatus = input.requiresReview ? "needs_review" : "proposed";

  if (isMockAuthEnabled()) {
    const state = getMockState();
    // Re-check immediately before inserting: closes the (vanishingly
    // small, single-threaded-JS) window between the pre-check above and
    // this write, so the mock path honors the same "never two active
    // rows for one idempotency key" guarantee the real DB's partial
    // unique index gives. Invalidated rows for this same key are left
    // alone -- they are history, not a conflict.
    const raceWinner = state.reconciliationCandidates.find(
      (item) => item.userId === draft.userId && item.idempotencyKey === idempotencyKey && item.status !== "invalidated",
    );
    if (raceWinner) return { record: raceWinner, created: false };

    const nowIso = new Date().toISOString();
    const record: ReconciliationCandidateRecord = {
      id: crypto.randomUUID(),
      userId: draft.userId,
      candidateType: draft.candidateType,
      status,
      confidence: draft.confidence,
      policyOutcome: input.policyOutcome,
      requiresReview: input.requiresReview,
      sourceTransactionIds: draft.sourceTransactionIds,
      relatedDebtIds: draft.relatedDebtIds,
      evidence: draft.evidence,
      evidenceSnapshots: draft.evidenceSnapshots,
      idempotencyKey,
      schemaVersion: RECONCILIATION_CANDIDATE_SCHEMA_VERSION,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.reconciliationCandidates.unshift(record);
    return { record, created: true };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reconciliation_candidates")
    .insert({
      user_id: draft.userId,
      candidate_type: draft.candidateType,
      status,
      confidence: draft.confidence,
      policy_outcome: input.policyOutcome,
      requires_review: input.requiresReview,
      source_transaction_ids: draft.sourceTransactionIds,
      related_debt_ids: draft.relatedDebtIds ?? null,
      evidence: draft.evidence,
      evidence_snapshots: draft.evidenceSnapshots,
      idempotency_key: idempotencyKey,
      schema_version: RECONCILIATION_CANDIDATE_SCHEMA_VERSION,
    })
    .select(RECONCILIATION_CANDIDATE_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const raceWinner = await findActiveReconciliationCandidateByIdempotencyKey(draft.userId, idempotencyKey);
      if (raceWinner) return { record: raceWinner, created: false };
    }
    throw new Error(error.message);
  }
  return { record: mapReconciliationCandidateRow(data as ReconciliationCandidateRow), created: true };
}

/**
 * Finds *any* row (active or invalidated) for a user/idempotency key --
 * general-purpose lookup, e.g. for inspecting a candidate's full
 * history. Not used by `createReconciliationCandidate`'s uniqueness
 * check, since more than one row can share a key once history
 * accumulates (see `findActiveReconciliationCandidateByIdempotencyKey`
 * for that). Returns the most recently created match if more than one
 * row shares the key.
 */
export async function findReconciliationCandidateByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<ReconciliationCandidateRecord | null> {
  if (isMockAuthEnabled()) {
    const matches = getMockState().reconciliationCandidates.filter(
      (item) => item.userId === userId && item.idempotencyKey === idempotencyKey,
    );
    if (matches.length === 0) return null;
    return [...matches].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reconciliation_candidates")
    .select(RECONCILIATION_CANDIDATE_COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapReconciliationCandidateRow(data as ReconciliationCandidateRow) : null;
}

/**
 * Finds the single *active* (non-invalidated) row for a user/idempotency
 * key, if any. At most one such row can ever exist at a time -- enforced
 * by the migration's partial unique index
 * (`reconciliation_candidates_user_idempotency_key_active_idx`, scoped
 * to `where status <> 'invalidated'`) -- so this is safe to treat as a
 * single-row lookup even though several *invalidated* historical rows
 * may share the same key.
 */
export async function findActiveReconciliationCandidateByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<ReconciliationCandidateRecord | null> {
  if (isMockAuthEnabled()) {
    const record = getMockState().reconciliationCandidates.find(
      (item) => item.userId === userId && item.idempotencyKey === idempotencyKey && item.status !== "invalidated",
    );
    return record ?? null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reconciliation_candidates")
    .select(RECONCILIATION_CANDIDATE_COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .neq("status", "invalidated")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapReconciliationCandidateRow(data as ReconciliationCandidateRow) : null;
}

export async function findReconciliationCandidateById(userId: string, id: string): Promise<ReconciliationCandidateRecord | null> {
  if (isMockAuthEnabled()) {
    const record = getMockState().reconciliationCandidates.find((item) => item.id === id && item.userId === userId);
    return record ?? null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reconciliation_candidates")
    .select(RECONCILIATION_CANDIDATE_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapReconciliationCandidateRow(data as ReconciliationCandidateRow) : null;
}

/** Recent candidates for a user, optionally scoped to one status -- the read path a future Review Inbox (PR B) would call. */
export async function listReconciliationCandidates(
  userId: string,
  status?: ReconciliationCandidateStatus,
): Promise<ReconciliationCandidateRecord[]> {
  if (isMockAuthEnabled()) {
    return getMockState()
      .reconciliationCandidates.filter((item) => item.userId === userId && (!status || item.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("reconciliation_candidates").select(RECONCILIATION_CANDIDATE_COLUMNS).eq("user_id", userId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapReconciliationCandidateRow(row as ReconciliationCandidateRow));
}

/** Every non-terminal candidate referencing a given source transaction id -- the lookup source-change invalidation needs. */
export async function listReconciliationCandidatesByTransactionId(
  userId: string,
  transactionId: string,
): Promise<ReconciliationCandidateRecord[]> {
  if (isMockAuthEnabled()) {
    return getMockState().reconciliationCandidates.filter(
      (item) =>
        item.userId === userId &&
        isInvalidatableReconciliationStatus(item.status) &&
        item.sourceTransactionIds.includes(transactionId),
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reconciliation_candidates")
    .select(RECONCILIATION_CANDIDATE_COLUMNS)
    .eq("user_id", userId)
    .in("status", INVALIDATABLE_RECONCILIATION_STATUSES)
    .contains("source_transaction_ids", [transactionId]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapReconciliationCandidateRow(row as ReconciliationCandidateRow));
}

export type InvalidateReconciliationCandidateInput = {
  userId: string;
  id: string;
  reason: string;
};

/** Marks a candidate invalidated -- never deletes it, preserving the audit trail. Idempotent: invalidating an already-invalidated candidate is a safe no-op that returns the existing row unchanged. */
export async function invalidateReconciliationCandidate(
  input: InvalidateReconciliationCandidateInput,
): Promise<ReconciliationCandidateRecord> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.reconciliationCandidates.findIndex((item) => item.id === input.id);
    if (index < 0) throw new Error("Reconciliation candidate not found");
    assertOwner(input.userId, state.reconciliationCandidates[index].userId);
    if (!isInvalidatableReconciliationStatus(state.reconciliationCandidates[index].status)) {
      return state.reconciliationCandidates[index];
    }
    state.reconciliationCandidates[index] = {
      ...state.reconciliationCandidates[index],
      status: "invalidated",
      invalidatedAt: new Date().toISOString(),
      invalidationReason: input.reason,
      updatedAt: new Date().toISOString(),
    };
    return state.reconciliationCandidates[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("reconciliation_candidates")
    .select("user_id, status")
    .eq("id", input.id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Reconciliation candidate not found");
  assertOwner(input.userId, existing.user_id);
  if (!isInvalidatableReconciliationStatus(existing.status)) {
    const current = await findReconciliationCandidateById(input.userId, input.id);
    if (current) return current;
  }

  const { data, error } = await supabase
    .from("reconciliation_candidates")
    .update({ status: "invalidated", invalidated_at: new Date().toISOString(), invalidation_reason: input.reason })
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .select(RECONCILIATION_CANDIDATE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return mapReconciliationCandidateRow(data as ReconciliationCandidateRow);
}
