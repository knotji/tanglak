/**
 * AI Financial Autopilot Phase 2 -- Smart Review & Reconciliation (PR A).
 *
 * Trust boundary: exactly the same as Phase 1
 * (see src/lib/autopilot/autopilot-types.ts). Gemini/AI never produces a
 * reconciliation candidate directly and never decides the policy outcome.
 * PR A's candidate-generation engines (own-account-transfer.ts,
 * possible-duplicate.ts, likely-debt-payment.ts, possible-refund.ts) are
 * pure, deterministic TypeScript operating only on already-persisted,
 * already-validated `Transaction`/`Debt` rows -- never on raw extraction
 * output. See docs/AUTOPILOT_PHASE2_RECONCILIATION.md for the full
 * architecture writeup.
 *
 * PR A never executes a reconciliation decision: it only generates and
 * persists candidates in a non-mutating, reviewable state. No debt
 * balance, transaction, or category is ever changed by this module.
 */

import type { AutopilotConfidence } from "@/lib/autopilot/autopilot-types";

/**
 * Confidence tiers are intentionally the exact same abstraction Phase 1
 * already uses (`AutopilotConfidence`) rather than a second, parallel
 * scale -- there is nothing reconciliation-specific about "how sure are
 * we", and reusing it means the DB can reuse
 * `public.autopilot_confidence_level` too (see the migration).
 */
export type ReconciliationConfidence = AutopilotConfidence;

/** The four kinds of relationship PR A can detect between financial records. */
export type ReconciliationCandidateType =
  | "own_account_transfer"
  | "possible_duplicate"
  | "likely_debt_payment"
  | "possible_refund";

/**
 * Minimal, explicit lifecycle. A candidate is `proposed` the instant the
 * deterministic engine emits it; `needs_review` once policy has assessed
 * it as requiring a human decision (the common case in PR A, since PR A
 * never executes `auto_match_safe`); `confirmed`/`rejected` are reserved
 * for PR B's Review Inbox actions (unused by anything in PR A -- no code
 * path in this PR ever writes them); `invalidated` means the source
 * evidence changed after generation (see reconciliation-invalidation.ts)
 * and the candidate must no longer be considered actionable.
 */
export type ReconciliationCandidateStatus = "proposed" | "needs_review" | "confirmed" | "rejected" | "invalidated";

/**
 * The policy engine's final verdict for a candidate. Distinct names from
 * `AutopilotDecision` (auto_execute/execute_with_notice/...) are
 * deliberate -- a reconciliation "match" and an autopilot "action" are
 * different decision spaces, even though the shape rhymes.
 *
 * IMPORTANT: PR A never executes `auto_match_safe`. The policy function
 * may still *return* it (so PR B/C have a stable signal to build on), but
 * no code in this PR reads that outcome and performs a write because of
 * it -- see reconciliation-scan.ts, which only ever proposes/persists.
 */
export type ReconciliationPolicyOutcome = "auto_match_safe" | "suggest_with_notice" | "require_confirmation" | "reject_candidate";

/**
 * Structured, non-prose reason codes -- the explanation layer
 * (reconciliation-explanations.ts) renders these into Thai copy. Naming
 * mirrors `AutopilotReasonCode`'s lower_snake_case convention.
 */
export type ReconciliationReasonCode =
  // shared / cross-cutting
  | "amount_exact_match"
  | "reference_match"
  | "merchant_similar"
  | "merchant_exact_match"
  | "same_document_id"
  | "distinct_source_records"
  | "timestamp_within_window"
  | "insufficient_evidence"
  | "multiple_possible_matches"
  // own_account_transfer
  | "opposite_direction"
  | "self_match_rejected"
  | "cross_user_rejected"
  | "account_hint_match"
  | "transfer_like_source"
  // possible_duplicate
  | "same_import_source"
  | "different_import_source"
  | "same_bangkok_day"
  // likely_debt_payment
  | "explicit_debt_destination"
  | "due_date_proximity"
  | "multiple_debt_matches"
  // possible_refund
  | "partial_refund_amount"
  | "multiple_earlier_expenses";

export type ReconciliationEvidence = {
  reasonCode: ReconciliationReasonCode;
  /** Optional interpolation data for the Thai template (e.g. an amount label, merchant fragment). Never raw extraction output, never a full row. */
  detail?: string;
};

/**
 * A deliberately narrow, bounded snapshot of a single source transaction's
 * reconciliation-relevant fields -- used both to build evidence and to
 * detect whether the transaction changed since candidate generation (see
 * reconciliation-invalidation.ts). Never a full row dump, never raw
 * extraction output, never an image/base64/credential.
 */
export type ReconciliationTransactionSnapshot = {
  type: string;
  amountSatang: number;
  occurredAt: string;
  merchant?: string;
  category?: string;
  /** DB-trigger-maintained; used only to detect "edited since generation". */
  updatedAt?: string;
};

/**
 * A candidate as produced by a matching engine, before persistence. Every
 * field here is bounded and serializable -- this is exactly what
 * `normalizedEvidence`/`sourceTransactionIds` become in the DB row.
 */
export type ReconciliationCandidateDraft = {
  userId: string;
  candidateType: ReconciliationCandidateType;
  /** Canonicalized (sorted) transaction ids this candidate concerns. Always >= 1, distinct. */
  sourceTransactionIds: string[];
  /** Only set for likely_debt_payment -- debts are not transactions, so they never appear in sourceTransactionIds. */
  relatedDebtIds?: string[];
  evidence: ReconciliationEvidence[];
  confidence: ReconciliationConfidence;
  /** Bounded snapshot per source transaction, same order as sourceTransactionIds. */
  evidenceSnapshots: ReconciliationTransactionSnapshot[];
};

/** Schema version for the persisted candidate shape -- bump if normalizedEvidence's structure changes incompatibly. */
export const RECONCILIATION_CANDIDATE_SCHEMA_VERSION = 1;

/** The full shape of a `reconciliation_candidates` row, as read back from the repository. */
export type ReconciliationCandidateRecord = {
  id: string;
  userId: string;
  candidateType: ReconciliationCandidateType;
  status: ReconciliationCandidateStatus;
  confidence: ReconciliationConfidence;
  policyOutcome?: ReconciliationPolicyOutcome;
  requiresReview: boolean;
  sourceTransactionIds: string[];
  relatedDebtIds?: string[];
  evidence: ReconciliationEvidence[];
  evidenceSnapshots: ReconciliationTransactionSnapshot[];
  idempotencyKey: string;
  schemaVersion: number;
  invalidatedAt?: string;
  invalidationReason?: string;
  createdAt: string;
  updatedAt: string;
};
