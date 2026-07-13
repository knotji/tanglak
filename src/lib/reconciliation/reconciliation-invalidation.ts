/**
 * Source-change invalidation -- Part G of the Phase 2 spec. A
 * reconciliation candidate's evidence is a snapshot in time; if the
 * transaction it references is later edited or deleted, the candidate
 * must stop looking valid rather than silently continue to display
 * stale evidence.
 *
 * This module never edits a transaction and never re-runs candidate
 * generation -- it only compares a transaction's current state (or its
 * absence) against the bounded snapshot captured at generation time
 * (see reconciliation-snapshot.ts), and marks affected candidates
 * `invalidated` when they no longer match. Nothing in PR A calls this
 * automatically (no trigger wiring into
 * updateTransaction/deleteTransaction yet) -- see
 * docs/AUTOPILOT_PHASE2_RECONCILIATION.md's known limitations.
 */

import type { Transaction } from "@/types/domain";
import {
  invalidateReconciliationCandidate,
  listReconciliationCandidatesByTransactionId,
} from "./reconciliation-candidates-repository";
import type { ReconciliationCandidateRecord, ReconciliationTransactionSnapshot } from "./reconciliation-types";

/**
 * True when a transaction's reconciliation-relevant fields have drifted
 * from the snapshot captured at candidate-generation time. Deliberately
 * narrow -- exactly the fields `buildReconciliationSnapshot` captures --
 * so an edit to an unrelated field (note, payment method, ...) never
 * triggers a spurious invalidation, and a manual category correction is
 * detected (via `category`) without this module needing to know
 * anything about `category_source`/manual-priority itself.
 */
export function hasSnapshotDrifted(current: Transaction, snapshot: ReconciliationTransactionSnapshot): boolean {
  return (
    current.type !== snapshot.type ||
    current.amountSatang !== snapshot.amountSatang ||
    current.occurredAt !== snapshot.occurredAt ||
    (current.merchant ?? undefined) !== snapshot.merchant ||
    (current.category ?? undefined) !== snapshot.category
  );
}

export type ReconciliationInvalidationReason = "transaction_deleted" | "transaction_modified";

/**
 * Re-validates every still-active (non-invalidated) candidate that
 * references `transactionId` against its current state, invalidating
 * any whose stored evidence no longer matches reality. Pass
 * `currentTransaction: undefined` for a deleted transaction. Idempotent:
 * an already-invalidated candidate is left untouched (see
 * `invalidateReconciliationCandidate`), so calling this more than once
 * for the same edit is always safe.
 */
export async function invalidateStaleReconciliationCandidates(
  userId: string,
  transactionId: string,
  currentTransaction: Transaction | undefined,
): Promise<ReconciliationCandidateRecord[]> {
  const candidates = await listReconciliationCandidatesByTransactionId(userId, transactionId);
  const invalidated: ReconciliationCandidateRecord[] = [];

  for (const candidate of candidates) {
    const index = candidate.sourceTransactionIds.indexOf(transactionId);
    const snapshot = index >= 0 ? candidate.evidenceSnapshots[index] : undefined;
    if (!snapshot) continue; // defensive: nothing recorded to compare against

    const reason: ReconciliationInvalidationReason | undefined = !currentTransaction
      ? "transaction_deleted"
      : hasSnapshotDrifted(currentTransaction, snapshot)
        ? "transaction_modified"
        : undefined;

    if (!reason) continue;

    invalidated.push(await invalidateReconciliationCandidate({ userId, id: candidate.id, reason }));
  }

  return invalidated;
}
