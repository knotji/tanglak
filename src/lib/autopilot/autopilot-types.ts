/**
 * AI Financial Autopilot -- core domain types (Phase 1 foundation).
 *
 * Trust boundary: Gemini (and any other AI provider) only ever produces an
 * `AutopilotActionProposal` candidate -- a plain data value. It never
 * writes to Supabase, never decides the final policy outcome, and is never
 * trusted as-is. Every proposal must pass through, in order:
 *   1. schema validation (autopilot-action-schema.ts)
 *   2. deterministic business validation (autopilot-validator.ts)
 *   3. the policy engine (autopilot-policy.ts), which alone decides the
 *      final AutopilotDecision
 *   4. the controlled executor (autopilot-executor.ts), which alone is
 *      allowed to write application data
 * See docs/AUTOPILOT_FOUNDATION.md for the full architecture writeup.
 */

/** How confident the system is that a proposed action is correct. */
export type AutopilotConfidence = "high" | "medium" | "low" | "unknown";

/** The policy engine's final verdict for a validated action proposal. */
export type AutopilotDecision = "auto_execute" | "execute_with_notice" | "require_confirmation" | "reject";

/** How much damage a wrong or unreviewed execution of this action could do. */
export type AutopilotRisk = "low" | "medium" | "high" | "irreversible";

export type AutopilotActionStatus = "proposed" | "validated" | "executed" | "rejected" | "failed" | "undone";

/** Where an action proposal originated. */
export type AutopilotActionSource = "slip_import" | "csv_import" | "manual_text" | "system_rule" | "user_correction";

/**
 * Allowlisted action types the executor is willing to perform. Anything
 * not in this list is rejected before it ever reaches the executor --
 * see ALLOWLISTED_ACTION_TYPES in autopilot-action-schema.ts.
 */
export type AutopilotActionType =
  | "create_transaction"
  | "update_transaction_category"
  | "mark_internal_transfer"
  | "ignore_duplicate_candidate";

/**
 * Where a transaction's category ultimately came from -- the provenance
 * chain the policy/executor must respect (manual always wins). Stored on
 * `transactions.category_source`.
 */
export type CategorySource = "manual" | "user_correction" | "learned_rule" | "merchant_rule" | "ai" | "default";

/** Structured, non-prose reason codes the explanation layer renders into Thai copy. See autopilot-explanations.ts. */
export type AutopilotReasonCode =
  | "exact_reference_match"
  | "known_merchant_category"
  | "canonical_category_valid"
  | "amount_and_time_confident"
  | "possible_internal_transfer"
  | "possible_duplicate"
  | "protected_manual_category"
  | "invalid_transaction_amount"
  | "unsupported_category"
  | "missing_critical_timestamp"
  | "low_extraction_confidence"
  | "schema_invalid"
  | "action_not_allowlisted"
  | "duplicate_of_existing_transaction"
  | "transaction_modified_since_execution"
  | "already_undone"
  | "not_owner";

export type AutopilotEvidence = {
  reasonCode: AutopilotReasonCode;
  /** Optional interpolation data for the Thai template (e.g. category label, merchant name). */
  detail?: string;
};

/** A snapshot of a transaction's mutable, undo-relevant fields -- used for previous_state/resulting_state/undo mutation detection. Deliberately narrow: never a full row dump, never anything that could be a secret. */
export type AutopilotTransactionSnapshot = {
  type: string;
  amountSatang: number;
  occurredAt: string;
  merchant?: string;
  category?: string;
};

/** The full shape of an `autopilot_actions` row, as read back from the repository. */
export type AutopilotActionRecord = {
  id: string;
  userId: string;
  actionType: AutopilotActionType;
  source: AutopilotActionSource;
  status: AutopilotActionStatus;
  decision?: AutopilotDecision;
  confidence: AutopilotConfidence;
  risk: AutopilotRisk;
  entityType: string;
  entityId?: string;
  idempotencyKey?: string;
  proposalPayload: unknown;
  normalizedPayload?: unknown;
  explanation?: string;
  validationErrors?: string[];
  previousState?: AutopilotTransactionSnapshot;
  resultingState?: AutopilotTransactionSnapshot;
  undoPayload?: unknown;
  executedAt?: string;
  undoneAt?: string;
  createdAt: string;
  updatedAt: string;
};
