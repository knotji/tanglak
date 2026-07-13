/**
 * Audit log persistence -- the append-only record of every autopilot
 * action's lifecycle, from proposal through execution/rejection/undo.
 * Mirrors the mock/Supabase branching convention used throughout
 * src/lib/data/finance-repository.ts.
 */

import { isMockAuthEnabled } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMockState } from "@/lib/data/mock-store";
import type {
  AutopilotActionRecord,
  AutopilotActionSource,
  AutopilotActionStatus,
  AutopilotActionType,
  AutopilotConfidence,
  AutopilotDecision,
  AutopilotRisk,
  AutopilotTransactionSnapshot,
} from "./autopilot-types";

function assertOwner(userId: string, ownerId: string) {
  if (userId !== ownerId) throw new Error("Cannot access another user's data");
}

export type CreateAuditRecordInput = {
  userId: string;
  actionType: AutopilotActionType;
  source: AutopilotActionSource;
  confidence: AutopilotConfidence;
  risk: AutopilotRisk;
  entityType?: string;
  /** Set only when this proposal is about to be executed -- see autopilot-executor.ts's computeIdempotencyKey. Enforced unique per user by the DB. */
  idempotencyKey?: string;
  proposalPayload: unknown;
  normalizedPayload?: unknown;
  explanation?: string;
  validationErrors?: string[];
};

const AUTOPILOT_ACTION_COLUMNS =
  "id, user_id, action_type, source, status, decision, confidence, risk, entity_type, entity_id, idempotency_key, proposal_payload, normalized_payload, explanation, validation_errors, previous_state, resulting_state, undo_payload, executed_at, undone_at, created_at, updated_at";

type AutopilotActionRow = {
  id: string;
  user_id: string;
  action_type: AutopilotActionType;
  source: AutopilotActionSource;
  status: AutopilotActionStatus;
  decision: AutopilotDecision | null;
  confidence: AutopilotConfidence;
  risk: AutopilotRisk;
  entity_type: string;
  entity_id: string | null;
  idempotency_key: string | null;
  proposal_payload: unknown;
  normalized_payload: unknown;
  explanation: string | null;
  validation_errors: unknown;
  previous_state: unknown;
  resulting_state: unknown;
  undo_payload: unknown;
  executed_at: string | null;
  undone_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapAutopilotActionRow(row: AutopilotActionRow): AutopilotActionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    actionType: row.action_type,
    source: row.source,
    status: row.status,
    decision: row.decision ?? undefined,
    confidence: row.confidence,
    risk: row.risk,
    entityType: row.entity_type,
    entityId: row.entity_id ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    proposalPayload: row.proposal_payload,
    normalizedPayload: row.normalized_payload ?? undefined,
    explanation: row.explanation ?? undefined,
    validationErrors: (row.validation_errors as string[] | null) ?? undefined,
    previousState: (row.previous_state as AutopilotTransactionSnapshot | null) ?? undefined,
    resultingState: (row.resulting_state as AutopilotTransactionSnapshot | null) ?? undefined,
    undoPayload: row.undo_payload ?? undefined,
    executedAt: row.executed_at ?? undefined,
    undoneAt: row.undone_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new audit record in "proposed" status -- the first thing the
 * executor does for any proposal, before validation or execution runs.
 * When `idempotencyKey` is set and a record with the same key already
 * exists for this user (a retried request for the exact same proposal),
 * returns the EXISTING record instead of creating a duplicate -- this is
 * the DB-enforced half of idempotency (see the unique index in the
 * migration); the executor still does its own pre-check first as a fast
 * path.
 */
export async function createAutopilotActionRecord(input: CreateAuditRecordInput): Promise<AutopilotActionRecord> {
  const nowIso = new Date().toISOString();
  if (isMockAuthEnabled()) {
    if (input.idempotencyKey) {
      const existing = getMockState().autopilotActions.find(
        (record) => record.userId === input.userId && record.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return existing;
    }
    const record: AutopilotActionRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      actionType: input.actionType,
      source: input.source,
      status: "proposed",
      confidence: input.confidence,
      risk: input.risk,
      entityType: input.entityType ?? "transaction",
      idempotencyKey: input.idempotencyKey,
      proposalPayload: input.proposalPayload,
      normalizedPayload: input.normalizedPayload,
      explanation: input.explanation,
      validationErrors: input.validationErrors,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    getMockState().autopilotActions.unshift(record);
    return record;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("autopilot_actions")
    .insert({
      user_id: input.userId,
      action_type: input.actionType,
      source: input.source,
      status: "proposed",
      confidence: input.confidence,
      risk: input.risk,
      entity_type: input.entityType ?? "transaction",
      idempotency_key: input.idempotencyKey ?? null,
      proposal_payload: input.proposalPayload,
      normalized_payload: input.normalizedPayload ?? null,
      explanation: input.explanation ?? null,
      validation_errors: input.validationErrors ?? null,
    })
    .select(AUTOPILOT_ACTION_COLUMNS)
    .single();
  if (error) {
    // Lost a create race to a concurrent identical request -- fall back to
    // the row that won, instead of erroring the whole action out.
    if (error.code === "23505" && input.idempotencyKey) {
      const existing = await findAutopilotActionByIdempotencyKey(input.userId, input.idempotencyKey);
      if (existing) return existing;
    }
    throw new Error(error.message);
  }
  return mapAutopilotActionRow(data as AutopilotActionRow);
}

export async function findAutopilotActionByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<AutopilotActionRecord | null> {
  if (isMockAuthEnabled()) {
    const record = getMockState().autopilotActions.find(
      (item) => item.userId === userId && item.idempotencyKey === idempotencyKey,
    );
    return record ?? null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("autopilot_actions")
    .select(AUTOPILOT_ACTION_COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapAutopilotActionRow(data as AutopilotActionRow) : null;
}

export type FinalizeAuditRecordInput = {
  userId: string;
  id: string;
  status: AutopilotActionStatus;
  decision?: AutopilotDecision;
  entityId?: string;
  explanation?: string;
  validationErrors?: string[];
  previousState?: AutopilotTransactionSnapshot;
  resultingState?: AutopilotTransactionSnapshot;
  undoPayload?: unknown;
  executedAt?: string;
  undoneAt?: string;
};

/** Updates an existing audit record after validation/policy/execution/undo completes -- never creates a second row for the same proposal. */
export async function finalizeAutopilotActionRecord(input: FinalizeAuditRecordInput): Promise<AutopilotActionRecord> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.autopilotActions.findIndex((record) => record.id === input.id);
    if (index < 0) throw new Error("Autopilot action record not found");
    assertOwner(input.userId, state.autopilotActions[index].userId);
    state.autopilotActions[index] = {
      ...state.autopilotActions[index],
      status: input.status,
      decision: input.decision ?? state.autopilotActions[index].decision,
      entityId: input.entityId ?? state.autopilotActions[index].entityId,
      explanation: input.explanation ?? state.autopilotActions[index].explanation,
      validationErrors: input.validationErrors ?? state.autopilotActions[index].validationErrors,
      previousState: input.previousState ?? state.autopilotActions[index].previousState,
      resultingState: input.resultingState ?? state.autopilotActions[index].resultingState,
      undoPayload: input.undoPayload ?? state.autopilotActions[index].undoPayload,
      executedAt: input.executedAt ?? state.autopilotActions[index].executedAt,
      undoneAt: input.undoneAt ?? state.autopilotActions[index].undoneAt,
      updatedAt: new Date().toISOString(),
    };
    return state.autopilotActions[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("autopilot_actions").select("user_id").eq("id", input.id).maybeSingle();
  if (!existing) throw new Error("Autopilot action record not found");
  assertOwner(input.userId, existing.user_id);

  const { data, error } = await supabase
    .from("autopilot_actions")
    .update({
      status: input.status,
      ...(input.decision ? { decision: input.decision } : {}),
      ...(input.entityId ? { entity_id: input.entityId } : {}),
      ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
      ...(input.validationErrors !== undefined ? { validation_errors: input.validationErrors } : {}),
      ...(input.previousState !== undefined ? { previous_state: input.previousState } : {}),
      ...(input.resultingState !== undefined ? { resulting_state: input.resultingState } : {}),
      ...(input.undoPayload !== undefined ? { undo_payload: input.undoPayload } : {}),
      ...(input.executedAt ? { executed_at: input.executedAt } : {}),
      ...(input.undoneAt ? { undone_at: input.undoneAt } : {}),
    })
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .select(AUTOPILOT_ACTION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return mapAutopilotActionRow(data as AutopilotActionRow);
}

export async function getAutopilotActionRecord(userId: string, id: string): Promise<AutopilotActionRecord | null> {
  if (isMockAuthEnabled()) {
    const record = getMockState().autopilotActions.find((item) => item.id === id && item.userId === userId);
    return record ?? null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("autopilot_actions")
    .select(AUTOPILOT_ACTION_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapAutopilotActionRow(data as AutopilotActionRow) : null;
}

/** Finds the executed create_transaction audit record for a given transaction, if any -- the lookup undo needs. */
export async function findAutopilotActionByEntity(
  userId: string,
  entityType: string,
  entityId: string,
): Promise<AutopilotActionRecord | null> {
  if (isMockAuthEnabled()) {
    const record = getMockState().autopilotActions.find(
      (item) => item.userId === userId && item.entityType === entityType && item.entityId === entityId && item.status === "executed",
    );
    return record ?? null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("autopilot_actions")
    .select(AUTOPILOT_ACTION_COLUMNS)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "executed")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapAutopilotActionRow(data as AutopilotActionRow) : null;
}

/** Recent autopilot activity for the small "สิ่งที่ TangLak จัดการให้" UI -- newest first, capped. */
export async function listRecentAutopilotActions(userId: string, limit = 20): Promise<AutopilotActionRecord[]> {
  if (isMockAuthEnabled()) {
    return getMockState()
      .autopilotActions.filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("autopilot_actions")
    .select(AUTOPILOT_ACTION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapAutopilotActionRow(row as AutopilotActionRow));
}
