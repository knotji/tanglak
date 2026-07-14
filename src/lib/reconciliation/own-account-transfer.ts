/**
 * Deterministic own-account-transfer candidate generation. Detects the
 * "recorded as two separate transactions instead of one transfer"
 * mistake -- an `expense` (money leaving one of the user's accounts) and
 * an `income` (money arriving in another) that likely describe the same
 * real-world movement of the user's own money.
 *
 * Pure function: no I/O, no Supabase, no Gemini. Callers (e.g.
 * reconciliation-scan.ts) are responsible for passing only this user's
 * `confirmed` transactions; this module additionally filters
 * defensively so a caller mistake can never produce a cross-user match.
 *
 * Deliberately conservative per the Phase 2 spec: a same-amount pair
 * alone (no reference number, no account hint, no transfer-like source)
 * never scores above `low` confidence, so the policy engine can never
 * treat it as more than "needs review" -- see reconciliation-policy.ts.
 */

import type { Transaction } from "@/types/domain";
import { confidenceTierFromScore } from "./reconciliation-confidence";
import { buildReconciliationSnapshot } from "./reconciliation-snapshot";
import { canonicalizeSourceTransactionIds } from "./reconciliation-idempotency";
import type { ReconciliationCandidateDraft, ReconciliationEvidence } from "./reconciliation-types";

export type OwnAccountTransferOptions = {
  /** Maximum minutes apart the two transactions' occurredAt may be, still considered "the same movement". Default 24h -- transfers can take time to post on the receiving side. */
  windowMinutes?: number;
  /** Satang tolerance for "matching amount". Default 0 -- PR A requires an exact match; a same-amount-ish pair alone must never be treated as a transfer. */
  amountToleranceSatang?: number;
};

const DEFAULT_WINDOW_MINUTES = 24 * 60;
const DEFAULT_AMOUNT_TOLERANCE_SATANG = 0;

function minutesBetween(left: string, right: string): number {
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) / 60_000;
}

type Direction = "outgoing" | "incoming";

function directionOf(transaction: Transaction): Direction | undefined {
  if (transaction.type === "expense") return "outgoing";
  if (transaction.type === "income") return "incoming";
  return undefined;
}

type PairCandidate = {
  outgoing: Transaction;
  incoming: Transaction;
  score: number;
  evidence: ReconciliationEvidence[];
};

function scorePair(outgoing: Transaction, incoming: Transaction): PairCandidate {
  const evidence: ReconciliationEvidence[] = [
    { reasonCode: "opposite_direction" },
    { reasonCode: "amount_exact_match" },
    { reasonCode: "timestamp_within_window" },
    { reasonCode: "distinct_source_records" },
  ];
  let score = 50; // base: exact amount + opposite direction + within window, all already required to reach this function

  if (outgoing.referenceNumber && incoming.referenceNumber && outgoing.referenceNumber === incoming.referenceNumber) {
    score += 20;
    evidence.push({ reasonCode: "reference_match" });
  }

  if (
    outgoing.destinationAccountLastFour &&
    incoming.accountLastFour &&
    outgoing.destinationAccountLastFour === incoming.accountLastFour
  ) {
    score += 15;
    evidence.push({ reasonCode: "account_hint_match" });
  }

  if (outgoing.source === "transfer_slip" || incoming.source === "transfer_slip") {
    score += 15;
    evidence.push({ reasonCode: "transfer_like_source" });
  }

  return { outgoing, incoming, score, evidence };
}

/**
 * Generates own-account-transfer candidates from a single user's
 * transactions. Only `expense`/`income` transactions are considered (an
 * already-tagged `transfer` needs no candidate); every emitted candidate
 * requires opposite direction, an exact amount match (or the documented
 * tolerance), and occurredAt within the safe window -- anything short of
 * that produces no candidate at all, never a low-confidence guess.
 */
export function generateOwnAccountTransferCandidates(
  userId: string,
  transactions: Transaction[],
  options: OwnAccountTransferOptions = {},
): ReconciliationCandidateDraft[] {
  const windowMinutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const amountTolerance = options.amountToleranceSatang ?? DEFAULT_AMOUNT_TOLERANCE_SATANG;

  // No cross-user matching, ever -- filtering here (rather than trusting
  // the caller) makes it structurally impossible for a mixed-user input
  // to produce a cross-user pair.
  const ownTransactions = transactions.filter((transaction) => transaction.userId === userId);

  const outgoing = ownTransactions.filter((transaction) => directionOf(transaction) === "outgoing");
  const incoming = ownTransactions.filter((transaction) => directionOf(transaction) === "incoming");

  const pairs: PairCandidate[] = [];
  for (const out of outgoing) {
    for (const inc of incoming) {
      if (out.id === inc.id) continue; // no self-match
      if (Math.abs(out.amountSatang - inc.amountSatang) > amountTolerance) continue;
      if (minutesBetween(out.occurredAt, inc.occurredAt) > windowMinutes) continue;
      pairs.push(scorePair(out, inc));
    }
  }

  // Ambiguity: if either side of a pair also appears in another pair,
  // neither pair may be treated as a confident match -- cap both at
  // "low" and record the ambiguity as evidence, rather than picking one
  // arbitrarily.
  const occurrenceCount = new Map<string, number>();
  for (const pair of pairs) {
    occurrenceCount.set(pair.outgoing.id, (occurrenceCount.get(pair.outgoing.id) ?? 0) + 1);
    occurrenceCount.set(pair.incoming.id, (occurrenceCount.get(pair.incoming.id) ?? 0) + 1);
  }

  return pairs.map((pair) => {
    const isAmbiguous = (occurrenceCount.get(pair.outgoing.id) ?? 0) > 1 || (occurrenceCount.get(pair.incoming.id) ?? 0) > 1;
    const evidence = isAmbiguous ? [...pair.evidence, { reasonCode: "multiple_possible_matches" as const }] : pair.evidence;
    const score = isAmbiguous ? Math.min(pair.score, 40) : pair.score;

    const sourceTransactionIds = canonicalizeSourceTransactionIds([pair.outgoing.id, pair.incoming.id]);
    const snapshotsById = new Map([
      [pair.outgoing.id, buildReconciliationSnapshot(pair.outgoing)],
      [pair.incoming.id, buildReconciliationSnapshot(pair.incoming)],
    ]);

    const draft: ReconciliationCandidateDraft = {
      userId,
      candidateType: "own_account_transfer",
      sourceTransactionIds,
      evidence,
      confidence: confidenceTierFromScore(score),
      evidenceSnapshots: sourceTransactionIds.map((id) => snapshotsById.get(id)!),
    };
    return draft;
  });
}
