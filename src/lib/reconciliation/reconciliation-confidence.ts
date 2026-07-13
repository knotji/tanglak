/**
 * Deterministic score -> confidence tier mapping, shared by every
 * matching engine (own-account-transfer.ts, possible-duplicate.ts,
 * likely-debt-payment.ts, possible-refund.ts) so the high/medium/low
 * boundary is defined and tested in exactly one place, never
 * re-invented per engine. Each engine still computes its own
 * domain-specific evidence score (documented at each call site and
 * covered by its own tests) -- only the score -> tier boundary is
 * centralized here.
 *
 * Mirrors the existing scoring convention already used in this codebase
 * (src/lib/finance/duplicates.ts's 0-100 point scale, and
 * src/lib/autopilot/autopilot-validator.ts's EXACT_DUPLICATE_SCORE = 80
 * threshold) rather than introducing a new scale.
 */

import type { ReconciliationConfidence } from "./reconciliation-types";

/** Strong, largely self-corroborating evidence (e.g. reference number + amount + time all agree). */
export const HIGH_CONFIDENCE_SCORE = 80;
/** Solid evidence, but missing one strong independent corroborating signal. */
export const MEDIUM_CONFIDENCE_SCORE = 55;
/** The minimum a candidate must score to be generated at all -- below this, engines emit nothing rather than a low-signal guess. */
export const LOW_CONFIDENCE_SCORE = 25;

/**
 * Maps a deterministic evidence score (0-100) to a confidence tier.
 * `unknown` is reserved for a non-finite/absent score (should not occur
 * on the normal candidate-generation path, since every engine only calls
 * this after computing a real numeric score) -- never silently treated
 * as "low" or "high".
 */
export function confidenceTierFromScore(score: number): ReconciliationConfidence {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= HIGH_CONFIDENCE_SCORE) return "high";
  if (score >= MEDIUM_CONFIDENCE_SCORE) return "medium";
  if (score >= LOW_CONFIDENCE_SCORE) return "low";
  return "unknown";
}
