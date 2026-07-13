/**
 * The deterministic decision policy engine -- the ONLY place an
 * AutopilotDecision is produced. Pure functions, no I/O, no React, fully
 * unit-testable. Gemini may supply confidence/explanation as input, but
 * never chooses the final decision (see module doc in autopilot-types.ts).
 */

import type { AutopilotValidationResult } from "./autopilot-validator";
import type { AutopilotConfidence, AutopilotDecision, AutopilotEvidence, AutopilotRisk } from "./autopilot-types";

export type AutopilotPolicyInput = {
  coreConfidence: AutopilotConfidence;
  categoryConfidence: AutopilotConfidence;
  validation: AutopilotValidationResult;
  /** Whether the proposed action, if executed, is safely undoable (create_transaction: true). */
  isReversible: boolean;
  /** Whether executing this action would touch/replace data the user manually set (e.g. a manually-chosen category). Always false for a brand-new create_transaction. */
  overridesManualData: boolean;
};

export type AutopilotPolicyResult = {
  decision: AutopilotDecision;
  risk: AutopilotRisk;
  evidence: AutopilotEvidence[];
};

function assessRisk(input: AutopilotPolicyInput): AutopilotRisk {
  if (input.overridesManualData) return "irreversible"; // protected data must never be silently touched
  if (!input.isReversible) return "high";
  if (input.validation.hasAmbiguousDuplicate) return "medium";
  return "low";
}

/**
 * Decides the final AutopilotDecision from already-validated facts.
 * Order matters: hard-reject conditions are checked first (never
 * downgraded to a softer tier), then confirmation-required ambiguity,
 * then the two "safe to act" tiers, defaulting to require_confirmation
 * for anything that doesn't cleanly clear every auto-execute/notice
 * condition -- an unmatched case is never silently auto-executed.
 */
export function decideAutopilotAction(input: AutopilotPolicyInput): AutopilotPolicyResult {
  const evidence: AutopilotEvidence[] = [...input.validation.evidence];
  const risk = assessRisk(input);

  // --- Reject ---
  if (!input.validation.ok) {
    return { decision: "reject", risk, evidence };
  }
  if (input.overridesManualData) {
    evidence.push({ reasonCode: "protected_manual_category" });
    return { decision: "reject", risk, evidence };
  }
  if (input.validation.hasExactDuplicate) {
    // A confident duplicate match means this exact transaction already
    // exists -- proposing to create it again is rejected outright, not
    // merely flagged for confirmation, per "ป้องกัน replay/idempotency
    // bugs". The executor's own idempotency key is a second, independent
    // safety net for literal request retries, not a replacement for this.
    return { decision: "reject", risk, evidence };
  }

  // --- Require confirmation ---
  if (input.validation.hasAmbiguousDuplicate) {
    return { decision: "require_confirmation", risk, evidence };
  }
  if (evidence.some((item) => item.reasonCode === "possible_internal_transfer")) {
    return { decision: "require_confirmation", risk, evidence };
  }
  if (!input.isReversible) {
    return { decision: "require_confirmation", risk, evidence };
  }
  if (input.coreConfidence === "low" || input.coreConfidence === "unknown") {
    return { decision: "require_confirmation", risk, evidence };
  }

  // From here on, coreConfidence is "high" or "medium" and there is no
  // duplicate/transfer ambiguity and the action is reversible.

  // --- Auto execute ---
  if (input.coreConfidence === "high" && input.categoryConfidence === "high") {
    evidence.push({ reasonCode: "amount_and_time_confident" }, { reasonCode: "canonical_category_valid" });
    return { decision: "auto_execute", risk, evidence };
  }

  // --- Execute with notice ---
  if (input.coreConfidence === "high" && (input.categoryConfidence === "medium" || input.categoryConfidence === "low")) {
    evidence.push({ reasonCode: "amount_and_time_confident" });
    return { decision: "execute_with_notice", risk, evidence };
  }
  if (input.coreConfidence === "medium" && input.categoryConfidence === "high") {
    evidence.push({ reasonCode: "canonical_category_valid" });
    return { decision: "execute_with_notice", risk, evidence };
  }

  // Medium core confidence + medium/low category confidence: the core
  // transaction fields aren't confidently read AND the category is also
  // uncertain -- too much combined uncertainty to write without asking.
  return { decision: "require_confirmation", risk, evidence };
}
