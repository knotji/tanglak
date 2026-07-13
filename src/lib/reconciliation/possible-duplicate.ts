/**
 * Deterministic possible-duplicate candidate generation across slip
 * uploads, manual entries, CSV imports, and history imports.
 *
 * Reuses the canonical duplicate-scoring helper
 * (src/lib/finance/duplicates.ts's `scoreDuplicateCandidate`, already
 * relied on by Phase 1's `autopilot-validator.ts`) as the base signal --
 * this module never reimplements amount/merchant/reference/time scoring,
 * it only adds the reconciliation-specific evidence (document id match,
 * Bangkok-safe same-day check, import-source comparison) on top and maps
 * the combined score to a candidate.
 *
 * Pure function: no I/O. A same-amount, same-time pair between two
 * genuinely separate purchases still produces a candidate (so it is
 * visible for review), but at low/medium confidence only -- PR A never
 * deletes, merges, or otherwise acts on it, so a legitimate repeated
 * purchase is never silently lost.
 */

import type { Transaction } from "@/types/domain";
import { scoreDuplicateCandidate } from "@/lib/finance/duplicates";
import { getBangkokDateOf } from "@/lib/finance/date";
import { confidenceTierFromScore } from "./reconciliation-confidence";
import { buildReconciliationSnapshot } from "./reconciliation-snapshot";
import { canonicalizeSourceTransactionIds } from "./reconciliation-idempotency";
import type { ReconciliationCandidateDraft, ReconciliationEvidence } from "./reconciliation-types";

/** Import-style sources where an identical second row is disproportionately likely to be an accidental re-import rather than a coincidence. */
const IMPORT_STYLE_SOURCES: readonly Transaction["source"][] = ["history_import", "statement"];

function scorePair(a: Transaction, b: Transaction): { score: number; evidence: ReconciliationEvidence[] } {
  const base = scoreDuplicateCandidate(a, b);
  let score = base.score;
  const evidence: ReconciliationEvidence[] = [{ reasonCode: "distinct_source_records" }];

  if (a.amountSatang === b.amountSatang) evidence.push({ reasonCode: "amount_exact_match" });
  if (a.referenceNumber && b.referenceNumber && a.referenceNumber === b.referenceNumber) {
    evidence.push({ reasonCode: "reference_match" });
  }

  if (a.documentId && b.documentId && a.documentId === b.documentId) {
    // As dominant a signal as an exact reference-number match (+90 in the
    // base scorer) -- two rows sharing a document id almost always means
    // the same source document was parsed into a transaction twice.
    score += 55;
    evidence.push({ reasonCode: "same_document_id" });
  }

  if (a.merchant && b.merchant) {
    if (a.merchant.toLowerCase() === b.merchant.toLowerCase()) {
      evidence.push({ reasonCode: "merchant_exact_match" });
    } else {
      evidence.push({ reasonCode: "merchant_similar" });
    }
  }

  if (getBangkokDateOf(a.occurredAt) === getBangkokDateOf(b.occurredAt)) {
    evidence.push({ reasonCode: "same_bangkok_day" });
  }

  if (a.source === b.source) {
    evidence.push({ reasonCode: "same_import_source" });
    if (IMPORT_STYLE_SOURCES.includes(a.source)) score += 10;
  } else {
    evidence.push({ reasonCode: "different_import_source" });
  }

  return { score: Math.min(100, score), evidence };
}

/**
 * Generates possible-duplicate candidates for every pair of this user's
 * transactions that clears the shared duplicate-score floor
 * (`LOW_CONFIDENCE_SCORE`, same 25-point floor `findDuplicateCandidates`
 * already uses). Every pair below that floor produces no candidate at
 * all.
 */
export function generatePossibleDuplicateCandidates(userId: string, transactions: Transaction[]): ReconciliationCandidateDraft[] {
  const ownTransactions = transactions.filter((transaction) => transaction.userId === userId);
  const drafts: ReconciliationCandidateDraft[] = [];

  for (let i = 0; i < ownTransactions.length; i += 1) {
    for (let j = i + 1; j < ownTransactions.length; j += 1) {
      const a = ownTransactions[i];
      const b = ownTransactions[j];
      if (a.id === b.id) continue; // no self-match

      const { score, evidence } = scorePair(a, b);
      const confidence = confidenceTierFromScore(score);
      if (confidence === "unknown") continue; // below the floor: not a candidate at all

      const sourceTransactionIds = canonicalizeSourceTransactionIds([a.id, b.id]);
      const snapshotsById = new Map([
        [a.id, buildReconciliationSnapshot(a)],
        [b.id, buildReconciliationSnapshot(b)],
      ]);

      drafts.push({
        userId,
        candidateType: "possible_duplicate",
        sourceTransactionIds,
        evidence,
        confidence,
        evidenceSnapshots: sourceTransactionIds.map((id) => snapshotsById.get(id)!),
      });
    }
  }

  return drafts;
}
