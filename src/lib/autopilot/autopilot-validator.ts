/**
 * Deterministic business validation -- runs after schema validation and
 * before the policy engine. This is where facts about the proposal get
 * established (is it a likely duplicate? does it look like an internal
 * transfer proposed as an expense? is the category actually protected
 * manual data?) so the policy engine can make its decision from
 * already-verified facts, never from raw AI claims.
 */

import { findDuplicateCandidates } from "@/lib/finance/duplicates";
import type { DuplicateCandidate, Transaction } from "@/types/domain";
import type { CreateTransactionPayload } from "./autopilot-action-schema";
import type { AutopilotEvidence } from "./autopilot-types";

export type CreateTransactionValidationInput = {
  payload: CreateTransactionPayload;
  /** This user's transactions in the relevant window (typically the proposal's month) to check against for duplicates. */
  candidateTransactions: Transaction[];
  /** Gemini's own hint that this might be a transfer between the user's own accounts -- informational only, never authoritative. */
  possibleOwnAccountTransfer?: boolean;
};

export type AutopilotValidationResult = {
  /** False only for a hard business-rule violation the schema couldn't catch (e.g. an internal-transfer-shaped expense). */
  ok: boolean;
  evidence: AutopilotEvidence[];
  duplicateCandidates: DuplicateCandidate[];
  /** True when the single strongest duplicate candidate is confident enough to treat as the same real-world transaction (idempotent replay, not two separate transactions). */
  hasExactDuplicate: boolean;
  /** True when a weaker duplicate signal exists -- ambiguous, must not be auto-decided either way. */
  hasAmbiguousDuplicate: boolean;
};

/** Score at/above this is treated as "the same real transaction" (reference number match, or amount+merchant+time all agreeing). */
const EXACT_DUPLICATE_SCORE = 80;

export function validateCreateTransactionAction(input: CreateTransactionValidationInput): AutopilotValidationResult {
  const evidence: AutopilotEvidence[] = [];
  let ok = true;

  const incoming: Transaction = {
    id: "proposed",
    userId: "proposed",
    type: input.payload.transactionType,
    status: "confirmed",
    amountSatang: input.payload.amountSatang,
    currency: "THB",
    occurredAt: input.payload.occurredAt,
    merchant: input.payload.merchant,
    category: input.payload.categoryId,
    source: "ai_extraction",
  };

  const duplicateCandidates = findDuplicateCandidates(incoming, input.candidateTransactions);
  const hasExactDuplicate = duplicateCandidates.some((candidate) => candidate.score >= EXACT_DUPLICATE_SCORE);
  const hasAmbiguousDuplicate = !hasExactDuplicate && duplicateCandidates.length > 0;

  if (hasExactDuplicate) {
    evidence.push({ reasonCode: "duplicate_of_existing_transaction" });
  } else if (hasAmbiguousDuplicate) {
    evidence.push({ reasonCode: "possible_duplicate" });
  }

  // An expense/income proposal that Gemini itself flagged as a likely
  // own-account transfer must never be silently auto-executed as spending
  // -- this is exactly the "internal transfer miscounted as expense" bug
  // class this foundation exists to prevent.
  if (input.possibleOwnAccountTransfer && input.payload.transactionType !== "transfer") {
    evidence.push({ reasonCode: "possible_internal_transfer" });
  }

  if (input.payload.transactionType === "transfer" && input.payload.categoryId !== "transfers") {
    // Already rejected at the schema layer (superRefine), but re-asserted
    // here defensively -- the validator must never assume the schema is
    // the only gate a proposal can reach it through.
    ok = false;
    evidence.push({ reasonCode: "unsupported_category" });
  }

  return { ok, evidence, duplicateCandidates, hasExactDuplicate, hasAmbiguousDuplicate };
}
