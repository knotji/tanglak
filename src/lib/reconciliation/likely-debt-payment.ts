/**
 * Deterministic likely-debt-payment candidate generation. Flags an
 * `expense` transaction that looks like it was actually a payment
 * towards one of the user's active debts, but was never linked via
 * `debt_id` (e.g. entered manually, or extracted from a slip that
 * didn't carry the debt link).
 *
 * PR A boundary (see docs/agent/FINANCIAL_INVARIANTS.md rule 4 and the
 * Phase 2 spec): this module only ever returns a review candidate. It
 * never mutates a debt, never creates a `debt_payment` transaction,
 * never calls `recalculateDebtPaidThisCycle`, and never touches the
 * debt payment simulator (src/lib/debt/*) -- it has no import of any of
 * those, so this is structural, not just a promise in a comment.
 *
 * Pure function: no I/O. Only `active`/`overdue` debts are considered --
 * a `paid_off`/`paused` debt is never a candidate target, consistent
 * with "reopening a closed debt is disabled in Phase 1".
 */

import type { Debt, Transaction } from "@/types/domain";
import { getBangkokDateOf } from "@/lib/finance/date";
import { confidenceTierFromScore } from "./reconciliation-confidence";
import { buildReconciliationSnapshot } from "./reconciliation-snapshot";
import type { ReconciliationCandidateDraft, ReconciliationEvidence } from "./reconciliation-types";

export type LikelyDebtPaymentOptions = {
  /** How many days before/after the debt's dueDate still counts as "due-date proximity". */
  dueDateProximityDays?: number;
};

const DEFAULT_DUE_DATE_PROXIMITY_DAYS = 7;
const ACTIVE_DEBT_STATUSES: readonly Debt["status"][] = ["active", "overdue"];

function dateKeyDaysApart(dateKeyA: string, dateKeyB: string): number {
  const [ay, am, ad] = dateKeyA.split("-").map(Number);
  const [by, bm, bd] = dateKeyB.split("-").map(Number);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / msPerDay;
}

function matchesDebtName(text: string | undefined, debt: Debt): boolean {
  if (!text) return false;
  const haystack = text.trim().toLowerCase();
  if (!haystack) return false;
  return [debt.name, debt.creditor]
    .filter((value): value is string => Boolean(value && value.trim()))
    .some((value) => haystack.includes(value.trim().toLowerCase()));
}

function isDueDateProximate(occurredAt: string, debt: Debt, proximityDays: number): boolean {
  if (!debt.dueDate) return false;
  return dateKeyDaysApart(getBangkokDateOf(occurredAt), debt.dueDate) <= proximityDays;
}

type DebtMatch = { debt: Debt; score: number; evidence: ReconciliationEvidence[] };

function scoreDebtMatch(transaction: Transaction, debt: Debt, proximityDays: number): DebtMatch | undefined {
  const explicitMatch = matchesDebtName(transaction.merchant, debt) || matchesDebtName(transaction.note, debt);
  const amountMatch =
    (debt.minimumPaymentSatang !== undefined && transaction.amountSatang === debt.minimumPaymentSatang) ||
    (debt.amountDueSatang !== undefined && transaction.amountSatang === debt.amountDueSatang);
  const dueProximate = isDueDateProximate(transaction.occurredAt, debt, proximityDays);

  // Too weak on its own: amount-only or due-date-only matches every debt
  // with a similar minimum payment, so require either an explicit
  // destination match, or amount + due-date proximity together.
  if (!explicitMatch && !(amountMatch && dueProximate)) return undefined;

  let score = 0;
  const evidence: ReconciliationEvidence[] = [];
  if (explicitMatch) {
    score += 40;
    evidence.push({ reasonCode: "explicit_debt_destination" });
  }
  if (amountMatch) {
    score += 30;
    evidence.push({ reasonCode: "amount_exact_match" });
  }
  if (dueProximate) {
    score += 15;
    evidence.push({ reasonCode: "due_date_proximity" });
  }

  return { debt, score, evidence };
}

/**
 * Generates likely-debt-payment candidates for a single user's expense
 * transactions against their currently active debts. A transaction that
 * plausibly matches more than one debt gets one candidate per matching
 * debt, all capped at "low" confidence and flagged
 * `multiple_debt_matches` -- ambiguity about *which* debt is never
 * resolved by picking one arbitrarily.
 */
export function generateLikelyDebtPaymentCandidates(
  userId: string,
  transactions: Transaction[],
  debts: Debt[],
  options: LikelyDebtPaymentOptions = {},
): ReconciliationCandidateDraft[] {
  const proximityDays = options.dueDateProximityDays ?? DEFAULT_DUE_DATE_PROXIMITY_DAYS;
  const expenseTransactions = transactions.filter((transaction) => transaction.userId === userId && transaction.type === "expense");
  const activeDebts = debts.filter((debt) => debt.userId === userId && ACTIVE_DEBT_STATUSES.includes(debt.status));

  const drafts: ReconciliationCandidateDraft[] = [];

  for (const transaction of expenseTransactions) {
    const matches = activeDebts
      .map((debt) => scoreDebtMatch(transaction, debt, proximityDays))
      .filter((match): match is DebtMatch => match !== undefined);

    if (matches.length === 0) continue;

    const isAmbiguous = matches.length > 1;
    for (const match of matches) {
      const evidence = isAmbiguous ? [...match.evidence, { reasonCode: "multiple_debt_matches" as const }] : match.evidence;
      const score = isAmbiguous ? Math.min(match.score, 40) : match.score;

      drafts.push({
        userId,
        candidateType: "likely_debt_payment",
        sourceTransactionIds: [transaction.id],
        relatedDebtIds: [match.debt.id],
        evidence,
        confidence: confidenceTierFromScore(score),
        evidenceSnapshots: [buildReconciliationSnapshot(transaction)],
      });
    }
  }

  return drafts;
}
