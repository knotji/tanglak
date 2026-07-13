/**
 * Slip Import vertical slice: turns a Gemini `ExtractedFinancialDocument`
 * (receipt / delivery_receipt only -- salary_slip, transfer_slip and
 * debt_statement keep using the existing manual ReviewForm/confirm flow
 * unchanged) into a validated `create_transaction` proposal and runs it
 * through the full Understand -> Validate -> Decide -> Act -> Explain
 * pipeline. This is the only place Slip Import talks to the autopilot
 * foundation; it never writes a transaction itself.
 */

import type { ExtractedFinancialDocument } from "@/lib/ai/schemas";
import { resolveExtractedCategory } from "@/lib/finance/category-fallback";
import { listRecentConfirmedTransactions } from "@/lib/data/finance-repository";
import { computeCategoryConfidence, computeCoreFieldConfidence } from "./autopilot-confidence";
import { parseAutopilotActionProposal } from "./autopilot-action-schema";
import { executeAutopilotAction } from "./autopilot-executor";
import { createAutopilotActionRecord, finalizeAutopilotActionRecord } from "./autopilot-audit";
import { buildDeterministicExplanation } from "./autopilot-explanations";
import type { Transaction } from "@/types/domain";

export type SlipAutopilotOutcome =
  | {
      kind: "executed";
      decision: "auto_execute" | "execute_with_notice";
      explanation: string;
      transaction: Transaction;
      auditRecordId: string;
    }
  | { kind: "deferred"; reason: string }
  | { kind: "not_applicable" };

const ELIGIBLE_DOCUMENT_TYPES = new Set(["receipt", "delivery_receipt"]);

function toAmountSatang(amountBaht: number): number {
  return Math.round(amountBaht * 100);
}

/**
 * Runs the autopilot decision pipeline for a single freshly-extracted slip.
 * Never throws for "the AI data wasn't good enough" cases -- those come
 * back as `{ kind: "deferred" }` so the caller falls through to the
 * existing manual review flow. Only a genuine executor/database failure
 * propagates as a thrown error (matching autopilot-executor's own
 * "never swallow errors" contract).
 */
export async function runSlipImportAutopilot(
  userId: string,
  documentId: string,
  extraction: ExtractedFinancialDocument,
): Promise<SlipAutopilotOutcome> {
  if (!ELIGIBLE_DOCUMENT_TYPES.has(extraction.documentType)) {
    return { kind: "not_applicable" };
  }

  const t = extraction.transaction;
  if (!t || t.type !== "expense" || t.amount === undefined || !t.occurredAt) {
    return { kind: "not_applicable" };
  }

  const unclearFields = extraction.unclearFields ?? [];
  const coreFieldsUnclear =
    unclearFields.includes("transaction.amount") ||
    unclearFields.includes("transaction.occurredAt") ||
    unclearFields.includes("amount") ||
    unclearFields.includes("occurredAt");

  const resolution = resolveExtractedCategory({
    categoryId: t.categoryId,
    merchant: t.merchant,
    description: t.note,
    defaultCategoryId: extraction.documentType === "delivery_receipt" ? "food" : "other",
  });

  const coreConfidence = coreFieldsUnclear ? "low" : computeCoreFieldConfidence(extraction.confidence);
  const categoryConfidence = computeCategoryConfidence(resolution, t.categoryConfidence);

  const candidate = {
    type: "create_transaction" as const,
    source: "slip_import" as const,
    sourceMetadata: {
      documentId,
      slipReferenceNumber: t.referenceNumber,
      merchant: t.merchant,
      rawCategoryLabel: t.category,
    },
    extractionConfidence: extraction.confidence,
    categoryConfidence: t.categoryConfidence,
    payload: {
      transactionType: "expense" as const,
      amountSatang: toAmountSatang(t.amount),
      occurredAt: t.occurredAt,
      merchant: t.merchant,
      categoryId: resolution.category.id,
      note: t.note,
    },
  };

  const schemaResult = parseAutopilotActionProposal(candidate);
  if (!schemaResult.ok) {
    // Schema rejection still gets an audit trail -- there is no executor
    // call to produce one, so this is written directly.
    const auditRecord = await createAutopilotActionRecord({
      userId,
      actionType: "create_transaction",
      source: "slip_import",
      confidence: coreConfidence,
      risk: "low",
      proposalPayload: candidate,
    });
    const explanation = buildDeterministicExplanation({
      decision: "reject",
      evidence: [{ reasonCode: "schema_invalid", detail: schemaResult.errors.join("; ") }],
    });
    await finalizeAutopilotActionRecord({
      userId,
      id: auditRecord.id,
      status: "rejected",
      decision: "reject",
      explanation,
      validationErrors: schemaResult.errors,
    });
    return { kind: "deferred", reason: "schema_invalid" };
  }

  const candidateTransactions = await listRecentConfirmedTransactions(userId);

  const result = await executeAutopilotAction({
    userId,
    proposal: schemaResult.proposal,
    coreConfidence,
    categoryConfidence,
    candidateTransactions,
    possibleOwnAccountTransfer: t.possibleOwnAccountTransfer,
  });

  if ((result.decision === "auto_execute" || result.decision === "execute_with_notice") && result.transaction) {
    return {
      kind: "executed",
      decision: result.decision,
      explanation: result.explanation,
      transaction: result.transaction,
      auditRecordId: result.auditRecordId,
    };
  }

  return { kind: "deferred", reason: result.decision };
}
