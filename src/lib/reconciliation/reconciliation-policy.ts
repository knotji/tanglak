/**
 * The deterministic reconciliation policy engine -- the ONLY place a
 * `ReconciliationPolicyOutcome` is produced. Pure, no I/O, fully
 * unit-testable, mirroring the shape (and the same defense-in-depth
 * philosophy) of src/lib/autopilot/autopilot-policy.ts: every structural
 * fact this function needs is passed in already-computed, and it
 * independently re-checks the invariants a caller bug could violate
 * (self-match, cross-user) rather than trusting the generator alone.
 *
 * IMPORTANT: `auto_match_safe` is a label only. No code in PR A executes
 * anything because of it -- see reconciliation-scan.ts, which persists
 * every candidate identically regardless of policyOutcome. The label
 * exists so PR B/C have a stable, already-tested signal to build
 * execution on top of.
 */

import type {
  ReconciliationCandidateType,
  ReconciliationConfidence,
  ReconciliationEvidence,
  ReconciliationPolicyOutcome,
  ReconciliationReasonCode,
} from "./reconciliation-types";

export type ReconciliationPolicyInput = {
  userId: string;
  candidateType: ReconciliationCandidateType;
  /** Already-canonicalized source transaction ids, as persisted. */
  sourceTransactionIds: string[];
  /** Defensive re-check only: the owning userId of each source transaction, if known to the caller. Same length/order as sourceTransactionIds. */
  sourceTransactionUserIds?: string[];
  confidence: ReconciliationConfidence;
  evidence: ReconciliationEvidence[];
};

export type ReconciliationPolicyResult = {
  outcome: ReconciliationPolicyOutcome;
  evidence: ReconciliationEvidence[];
};

/** Evidence strong enough, on a `high`-confidence candidate, to justify the (never-executed-in-PR-A) auto_match_safe label. */
const STRONG_CORROBORATION_CODES: ReadonlySet<ReconciliationReasonCode> = new Set([
  "reference_match",
  "same_document_id",
  "account_hint_match",
]);

/** Evidence codes meaning "more than one plausible match exists" -- always caps the outcome at require_confirmation, regardless of the numeric confidence score. */
const AMBIGUITY_CODES: ReadonlySet<ReconciliationReasonCode> = new Set([
  "multiple_possible_matches",
  "multiple_debt_matches",
  "multiple_earlier_expenses",
]);

/**
 * Candidate types where PR A deliberately never returns anything above
 * `require_confirmation`, even for strong evidence: a debt-payment link
 * or a refund both carry follow-on financial consequences (which debt's
 * balance/cycle a payment affects; reversing a categorized expense) that
 * this phase intentionally leaves to a human, per the Phase 2 spec ("PR A
 * may create a review candidate only" / "do not auto-confirm refunds in
 * PR A").
 */
const CONFIRMATION_ONLY_TYPES: ReadonlySet<ReconciliationCandidateType> = new Set(["likely_debt_payment", "possible_refund"]);

/**
 * Decides the final ReconciliationPolicyOutcome from already-computed
 * evidence and confidence. Order matters: structural invalidity is
 * checked first (never downgraded to a softer tier), then ambiguity,
 * then the confirmation-only type ceiling, then confidence-based
 * tiering -- anything that doesn't cleanly clear a specific condition
 * defaults to `require_confirmation`, never silently to something else.
 */
export function decideReconciliationPolicy(input: ReconciliationPolicyInput): ReconciliationPolicyResult {
  const evidence = [...input.evidence];

  // --- Reject: structurally invalid, independent of what the generator promised ---
  const uniqueIds = new Set(input.sourceTransactionIds);
  if (input.sourceTransactionIds.length === 0 || uniqueIds.size !== input.sourceTransactionIds.length) {
    evidence.push({ reasonCode: "self_match_rejected" });
    return { outcome: "reject_candidate", evidence };
  }
  if (input.sourceTransactionUserIds?.some((ownerId) => ownerId !== input.userId)) {
    evidence.push({ reasonCode: "cross_user_rejected" });
    return { outcome: "reject_candidate", evidence };
  }

  // --- Require confirmation: ambiguity always wins over a high numeric score ---
  if (evidence.some((item) => AMBIGUITY_CODES.has(item.reasonCode))) {
    return { outcome: "require_confirmation", evidence };
  }

  // --- Require confirmation: no real signal to act on ---
  if (input.confidence === "unknown") {
    evidence.push({ reasonCode: "insufficient_evidence" });
    return { outcome: "require_confirmation", evidence };
  }

  // --- Confirmation-only candidate types: never exceed require_confirmation in PR A ---
  if (CONFIRMATION_ONLY_TYPES.has(input.candidateType)) {
    return { outcome: "require_confirmation", evidence };
  }

  const hasStrongCorroboration = evidence.some((item) => STRONG_CORROBORATION_CODES.has(item.reasonCode));

  // --- Auto match safe (label only -- never executed in PR A) ---
  if (input.confidence === "high" && hasStrongCorroboration) {
    return { outcome: "auto_match_safe", evidence };
  }

  // --- Suggest with notice ---
  if (input.confidence === "high" || input.confidence === "medium") {
    return { outcome: "suggest_with_notice", evidence };
  }

  // --- Default: low confidence (or anything unforeseen) always requires confirmation ---
  return { outcome: "require_confirmation", evidence };
}

/** True for confidences this module treats as "low" for the purposes of the default fallback -- exported for tests that want to assert the exhaustive tier list without duplicating it. */
export const NON_ACTIONABLE_CONFIDENCES: readonly ReconciliationConfidence[] = ["low", "unknown"];
