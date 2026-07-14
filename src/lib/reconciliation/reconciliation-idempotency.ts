/**
 * Deterministic idempotency-key computation for reconciliation candidates.
 * Mirrors `computeIdempotencyKey` in
 * src/lib/autopilot/autopilot-executor.ts (same sha256-of-joined-parts
 * shape), but canonicalizes the source transaction id order first --
 * required so that generating a candidate for [A, B] and, on a later
 * scan, [B, A] (e.g. because the underlying query returned rows in a
 * different order) produce the exact same key. This is the application-
 * level half of "repeated scan is idempotent" / "reversed source-ID order
 * produces same idempotency key"; the DB-level half is the unique index
 * on (user_id, idempotency_key) in the migration.
 */

import { createHash } from "node:crypto";
import type { ReconciliationCandidateType } from "./reconciliation-types";

/** Sorts transaction ids so pair (or group) order never affects the resulting key. Pure, no side effects. */
export function canonicalizeSourceTransactionIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export type ReconciliationIdempotencyInput = {
  userId: string;
  candidateType: ReconciliationCandidateType;
  sourceTransactionIds: string[];
  /** Only relevant for likely_debt_payment, where the "other side" is a debt, not a transaction. */
  relatedDebtIds?: string[];
};

/**
 * Computes the stable idempotency key for a candidate. Callers must pass
 * the *original* (non-canonicalized) id list -- canonicalization happens
 * here, once, so every caller gets the same guarantee without having to
 * remember to sort first.
 */
export function computeReconciliationIdempotencyKey(input: ReconciliationIdempotencyInput): string {
  const canonicalTransactionIds = canonicalizeSourceTransactionIds(input.sourceTransactionIds);
  const canonicalDebtIds = canonicalizeSourceTransactionIds(input.relatedDebtIds ?? []);
  const parts = [input.userId, input.candidateType, canonicalTransactionIds.join(","), canonicalDebtIds.join(",")];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
