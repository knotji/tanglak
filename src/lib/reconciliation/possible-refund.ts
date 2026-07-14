/**
 * Deterministic possible-refund candidate generation. Flags an
 * `income`/`refund`-typed transaction that plausibly reverses an earlier
 * `expense` -- but only ever as a review candidate; see
 * docs/agent/FINANCIAL_INVARIANTS.md and the Phase 2 spec ("do not
 * auto-confirm refunds in PR A"). Nothing in this module writes
 * anything; the policy engine additionally never grants this candidate
 * type more than `require_confirmation` (see reconciliation-policy.ts).
 *
 * Deliberately conservative: a candidate is only ever generated when
 * there is genuine merchant or reference-number evidence tying the two
 * transactions together -- an incoming transfer/income with no such
 * evidence is never classified as a refund, no matter how well the
 * amount and timing line up.
 */

import type { Transaction } from "@/types/domain";
import { confidenceTierFromScore } from "./reconciliation-confidence";
import { buildReconciliationSnapshot } from "./reconciliation-snapshot";
import { canonicalizeSourceTransactionIds } from "./reconciliation-idempotency";
import type { ReconciliationCandidateDraft, ReconciliationEvidence } from "./reconciliation-types";

export type PossibleRefundOptions = {
  /** Maximum days between the original expense and the possible refund. Default 90 -- most consumer refund windows close well before this. */
  windowDays?: number;
};

const DEFAULT_WINDOW_DAYS = 90;
const TIGHT_WINDOW_DAYS = 7;
const REFUND_LIKE_TYPES: readonly Transaction["type"][] = ["income", "refund"];

function daysApart(earlier: string, later: string): number {
  return (new Date(later).getTime() - new Date(earlier).getTime()) / (24 * 60 * 60 * 1000);
}

type RefundMatch = { expense: Transaction; score: number; evidence: ReconciliationEvidence[] };

function scoreRefundMatch(expense: Transaction, refund: Transaction, windowDays: number): RefundMatch | undefined {
  if (refund.amountSatang <= 0 || refund.amountSatang > expense.amountSatang) return undefined; // a refund never exceeds the original expense

  const elapsedDays = daysApart(expense.occurredAt, refund.occurredAt);
  if (elapsedDays < 0 || elapsedDays > windowDays) return undefined; // refund must follow the expense, within the safe window

  const merchantMatch = Boolean(expense.merchant && refund.merchant && expense.merchant.toLowerCase() === refund.merchant.toLowerCase());
  const referenceMatch = Boolean(expense.referenceNumber && refund.referenceNumber && expense.referenceNumber === refund.referenceNumber);
  if (!merchantMatch && !referenceMatch) return undefined; // no merchant/reference evidence: never classified as a refund

  let score = 0;
  const evidence: ReconciliationEvidence[] = [{ reasonCode: "distinct_source_records" }];

  if (merchantMatch) {
    score += 35;
    evidence.push({ reasonCode: "merchant_exact_match" });
  }
  if (referenceMatch) {
    score += 35;
    evidence.push({ reasonCode: "reference_match" });
  }

  if (refund.amountSatang === expense.amountSatang) {
    score += 20;
    evidence.push({ reasonCode: "amount_exact_match" });
  } else {
    score += 10;
    evidence.push({ reasonCode: "partial_refund_amount" });
  }

  if (elapsedDays <= TIGHT_WINDOW_DAYS) {
    score += 10;
    evidence.push({ reasonCode: "timestamp_within_window" });
  }

  return { expense, score, evidence };
}

/**
 * Generates possible-refund candidates for a single user's transactions.
 * A refund-like transaction that matches more than one earlier expense
 * (e.g. two identical purchases from the same merchant) produces one
 * candidate per matching expense, all capped at "low" confidence and
 * flagged `multiple_earlier_expenses`.
 */
export function generatePossibleRefundCandidates(
  userId: string,
  transactions: Transaction[],
  options: PossibleRefundOptions = {},
): ReconciliationCandidateDraft[] {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const ownTransactions = transactions.filter((transaction) => transaction.userId === userId);
  const expenses = ownTransactions.filter((transaction) => transaction.type === "expense");
  const refundLikeTransactions = ownTransactions.filter((transaction) => REFUND_LIKE_TYPES.includes(transaction.type));

  const drafts: ReconciliationCandidateDraft[] = [];

  for (const refund of refundLikeTransactions) {
    const matches = expenses
      .filter((expense) => expense.id !== refund.id)
      .map((expense) => scoreRefundMatch(expense, refund, windowDays))
      .filter((match): match is RefundMatch => match !== undefined);

    if (matches.length === 0) continue;

    const isAmbiguous = matches.length > 1;
    for (const match of matches) {
      const evidence = isAmbiguous ? [...match.evidence, { reasonCode: "multiple_earlier_expenses" as const }] : match.evidence;
      const score = isAmbiguous ? Math.min(match.score, 40) : match.score;

      const sourceTransactionIds = canonicalizeSourceTransactionIds([match.expense.id, refund.id]);
      const snapshotsById = new Map([
        [match.expense.id, buildReconciliationSnapshot(match.expense)],
        [refund.id, buildReconciliationSnapshot(refund)],
      ]);

      drafts.push({
        userId,
        candidateType: "possible_refund",
        sourceTransactionIds,
        evidence,
        confidence: confidenceTierFromScore(score),
        evidenceSnapshots: sourceTransactionIds.map((id) => snapshotsById.get(id)!),
      });
    }
  }

  return drafts;
}
