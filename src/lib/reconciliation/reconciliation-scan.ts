/**
 * Minimal internal integration seam (Phase 2 PR A). Generates
 * reconciliation candidates from a single user's own confirmed
 * transactions/debts, decides each one's policy outcome, and persists
 * them idempotently. Nothing calls this function yet -- no server
 * action, no cron, no UI button, no route. It exists so PR B/C (and this
 * PR's own tests) have one already-tested entry point rather than each
 * having to re-wire the four generators + policy + repository by hand.
 *
 * This function never mutates a transaction or a debt, and never
 * advances a candidate past `proposed`/`needs_review` -- see
 * reconciliation-candidates-repository.ts.
 */

import { listAllTransactions, listDebts } from "@/lib/data/finance-repository";
import { generateOwnAccountTransferCandidates } from "./own-account-transfer";
import { generatePossibleDuplicateCandidates } from "./possible-duplicate";
import { generateLikelyDebtPaymentCandidates } from "./likely-debt-payment";
import { generatePossibleRefundCandidates } from "./possible-refund";
import { decideReconciliationPolicy } from "./reconciliation-policy";
import { createReconciliationCandidate } from "./reconciliation-candidates-repository";
import type { ReconciliationCandidateDraft, ReconciliationCandidateRecord } from "./reconciliation-types";

export type ScanForReconciliationCandidatesResult = {
  /** How many confirmed transactions were considered as candidate-generation input. */
  scanned: number;
  /** How many new candidate rows were inserted by this call. */
  created: number;
  /** How many generated candidates already existed (same idempotency key) and were left untouched. */
  skippedExisting: number;
  /** How many candidates the policy engine rejected outright (never persisted). */
  rejected: number;
  records: ReconciliationCandidateRecord[];
};

/**
 * Runs all four deterministic matching engines against this user's own
 * confirmed transactions/debts and persists every non-rejected result.
 * Safe to call repeatedly (including concurrently) for the same user --
 * see reconciliation-idempotency.ts and the DB's unique index on
 * (user_id, idempotency_key) -- a repeated or overlapping scan never
 * creates duplicate rows.
 */
export async function scanForReconciliationCandidates(userId: string): Promise<ScanForReconciliationCandidatesResult> {
  // skipRollover: true -- this scan must never mutate debts (see "never
  // mutates transactions or debts" in reconciliation-scan.test.ts); the
  // lazy cycle-rollover in listDebts is a write side effect that has no
  // place in a read-only candidate scan.
  const [transactions, debts] = await Promise.all([
    listAllTransactions(userId),
    listDebts(userId, false, new Date(), { skipRollover: true }),
  ]);
  const confirmedTransactions = transactions.filter((transaction) => transaction.status === "confirmed");

  const drafts: ReconciliationCandidateDraft[] = [
    ...generateOwnAccountTransferCandidates(userId, confirmedTransactions),
    ...generatePossibleDuplicateCandidates(userId, confirmedTransactions),
    ...generateLikelyDebtPaymentCandidates(userId, confirmedTransactions, debts),
    ...generatePossibleRefundCandidates(userId, confirmedTransactions),
  ];

  let created = 0;
  let skippedExisting = 0;
  let rejected = 0;
  const records: ReconciliationCandidateRecord[] = [];

  for (const draft of drafts) {
    const policyResult = decideReconciliationPolicy({
      userId,
      candidateType: draft.candidateType,
      sourceTransactionIds: draft.sourceTransactionIds,
      confidence: draft.confidence,
      evidence: draft.evidence,
    });

    if (policyResult.outcome === "reject_candidate") {
      rejected += 1;
      continue; // structurally invalid -- never persisted, nothing to review
    }

    const result = await createReconciliationCandidate({
      draft: { ...draft, evidence: policyResult.evidence },
      policyOutcome: policyResult.outcome,
      // Informational for now (PR A executes nothing regardless): only
      // auto_match_safe is recorded as not requiring review, so PR B/C
      // inherit a meaningful signal instead of a constant.
      requiresReview: policyResult.outcome !== "auto_match_safe",
    });

    if (result.created) created += 1;
    else skippedExisting += 1;
    records.push(result.record);
  }

  return { scanned: confirmedTransactions.length, created, skippedExisting, rejected, records };
}
