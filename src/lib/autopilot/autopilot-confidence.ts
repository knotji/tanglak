/**
 * Deterministic confidence scoring. Gemini's own confidence numbers are
 * treated as one input signal, never trusted directly as the policy
 * decision -- see autopilot-policy.ts, which only ever consumes the
 * AutopilotConfidence tiers produced here, not raw model scores.
 */

import type { ExtractedCategoryResolution } from "@/lib/finance/category-fallback";
import type { AutopilotConfidence } from "./autopilot-types";

const HIGH_THRESHOLD = 0.85;
const MEDIUM_THRESHOLD = 0.55;

/**
 * Confidence in the core transaction fields (amount, occurredAt, type) --
 * derived from the document-level extraction confidence Gemini reports.
 * Thresholds match the app's existing extraction-review convention
 * (0.5 is already used elsewhere as the "low confidence, needs review"
 * boundary for document extraction warnings).
 */
export function computeCoreFieldConfidence(extractionConfidence: number | undefined): AutopilotConfidence {
  if (extractionConfidence === undefined) return "unknown";
  if (extractionConfidence >= HIGH_THRESHOLD) return "high";
  if (extractionConfidence >= MEDIUM_THRESHOLD) return "medium";
  return "low";
}

/**
 * Confidence in the resolved category specifically -- distinct from core
 * field confidence, since a transaction's amount/date can be certain while
 * its category is still a best-effort guess. This is what separates
 * auto_execute (category confidence must be high) from execute_with_notice
 * (category confidence medium is acceptable, but the user is told the
 * category was auto-assigned).
 */
export function computeCategoryConfidence(
  resolution: ExtractedCategoryResolution,
  aiCategoryConfidence: number | undefined,
): AutopilotConfidence {
  if (resolution.source === "ai") {
    if (aiCategoryConfidence === undefined) return "medium";
    if (aiCategoryConfidence >= HIGH_THRESHOLD) return "high";
    if (aiCategoryConfidence >= MEDIUM_THRESHOLD) return "medium";
    return "low";
  }
  // A deterministic merchant-hint match is reliable but was never
  // explicitly asserted by the model -- treat as medium, matching the
  // "category confidence ปานกลาง" tier (execute_with_notice), not high.
  if (resolution.source === "rule") return "medium";
  // No real signal at all -- the generic "other" bucket.
  return "low";
}
