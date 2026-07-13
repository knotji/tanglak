/**
 * The controlled executor -- the ONLY code path allowed to turn a
 * validated, policy-approved AutopilotActionProposal into a real write.
 * No UI, route handler, or AI helper may call createTransaction directly
 * for an autopilot-originated action; they must go through
 * `executeAutopilotAction` here, which enforces: ownership, idempotency,
 * the action-type allowlist, and an audit record for every outcome
 * (proposed -> validated/rejected -> executed/failed).
 */

import { createHash } from "node:crypto";
import { createTransaction } from "@/lib/data/finance-repository";
import type { Transaction } from "@/types/domain";
import { getCategoryById } from "@/lib/finance/categories";
import { ALLOWLISTED_ACTION_TYPES, type AutopilotActionProposal } from "./autopilot-action-schema";
import { validateCreateTransactionAction, type AutopilotValidationResult } from "./autopilot-validator";
import { decideAutopilotAction, type AutopilotPolicyInput } from "./autopilot-policy";
import { buildDeterministicExplanation } from "./autopilot-explanations";
import { createAutopilotActionRecord, finalizeAutopilotActionRecord } from "./autopilot-audit";
import { setTransactionCategoryProvenance } from "./autopilot-provenance";
import type { AutopilotConfidence, AutopilotDecision, AutopilotTransactionSnapshot } from "./autopilot-types";

export type ExecuteAutopilotActionInput = {
  userId: string;
  proposal: AutopilotActionProposal;
  coreConfidence: AutopilotConfidence;
  categoryConfidence: AutopilotConfidence;
  /** This user's candidate transactions to check the proposal against for duplicates (e.g. this month's transactions). Required for create_transaction. */
  candidateTransactions?: Transaction[];
  possibleOwnAccountTransfer?: boolean;
};

export type ExecuteAutopilotActionResult = {
  ok: boolean;
  auditRecordId: string;
  decision: AutopilotDecision;
  explanation: string;
  /** Present only when the action actually executed (auto_execute / execute_with_notice). */
  transaction?: Transaction;
  /** Present for reject/require_confirmation outcomes, or an execution failure. */
  errors?: string[];
};

function snapshotTransaction(transaction: Transaction): AutopilotTransactionSnapshot {
  return {
    type: transaction.type,
    amountSatang: transaction.amountSatang,
    occurredAt: transaction.occurredAt,
    merchant: transaction.merchant,
    category: transaction.category,
  };
}

/**
 * Deterministic idempotency fingerprint for a create_transaction proposal:
 * source + slip/document reference (or merchant, if no reference number
 * was extracted) + amount + normalized occurredAt + user. Deliberately
 * does NOT include free-text note/description, which could differ
 * cosmetically between two calls describing the same real transaction and
 * would defeat the point of the key; also deliberately narrow enough that
 * it can never accidentally fingerprint-match two genuinely different
 * transactions (e.g. two separate ฿20 coffees on the same day would have
 * different occurredAt minutes and so different keys).
 */
export function computeIdempotencyKey(userId: string, proposal: AutopilotActionProposal): string | undefined {
  if (proposal.type !== "create_transaction") return undefined;
  const parts = [
    userId,
    proposal.type,
    proposal.source,
    proposal.sourceMetadata?.documentId ?? "",
    proposal.sourceMetadata?.slipReferenceNumber ?? "",
    proposal.payload.transactionType,
    String(proposal.payload.amountSatang),
    proposal.payload.occurredAt,
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Executes (or rejects / defers) a single validated action proposal.
 * Always writes an audit record, for every decision outcome -- this is
 * what "audit record ทุกกรณี" means in practice: proposed rows exist even
 * for actions the policy ultimately rejects or defers to the user.
 */
export async function executeAutopilotAction(input: ExecuteAutopilotActionInput): Promise<ExecuteAutopilotActionResult> {
  const { userId, proposal } = input;

  if (!ALLOWLISTED_ACTION_TYPES.includes(proposal.type)) {
    // Defensive re-check -- parseAutopilotActionProposal already enforces
    // this, but the executor must never trust that every caller used it.
    throw new Error(`Action type "${proposal.type}" is not allowlisted for execution`);
  }

  if (proposal.type !== "create_transaction") {
    // Phase 1 implements create_transaction end-to-end from Slip Import.
    // The other allowlisted action types have validated schemas and a
    // reserved contract here, but no caller wires them to execution yet
    // -- see docs/AUTOPILOT_FOUNDATION.md "Known limitations". This must
    // still fail closed (never silently "succeed") AND leave an explicit
    // rejected audit record -- a thrown error with no audit trail would
    // satisfy "fail closed" but not "every outcome is audited".
    const unsupportedAuditRecord = await createAutopilotActionRecord({
      userId,
      actionType: proposal.type,
      source: proposal.source,
      confidence: input.coreConfidence,
      risk: "low",
      proposalPayload: proposal,
    });
    const unsupportedExplanation = buildDeterministicExplanation({
      decision: "reject",
      evidence: [{ reasonCode: "action_not_allowlisted", detail: "No executor implementation for this action type in Phase 1" }],
    });
    await finalizeAutopilotActionRecord({
      userId,
      id: unsupportedAuditRecord.id,
      status: "rejected",
      decision: "reject",
      explanation: unsupportedExplanation,
      validationErrors: ["action_not_allowlisted"],
    });
    throw new Error(`Action type "${proposal.type}" has a schema but no executor implementation yet`);
  }

  const idempotencyKey = computeIdempotencyKey(userId, proposal);

  const auditRecord = await createAutopilotActionRecord({
    userId,
    actionType: proposal.type,
    source: proposal.source,
    confidence: input.coreConfidence,
    risk: "low",
    idempotencyKey,
    proposalPayload: proposal,
  });

  // The idempotency key already existed and was already executed -- this
  // is a retried request for the same proposal, not a new transaction.
  // Return the prior result rather than executing (or re-validating) a
  // second time.
  if (auditRecord.status === "executed" && auditRecord.entityId) {
    return {
      ok: true,
      auditRecordId: auditRecord.id,
      decision: auditRecord.decision ?? "auto_execute",
      explanation: auditRecord.explanation ?? "",
      transaction: undefined,
    };
  }

  const validation: AutopilotValidationResult = validateCreateTransactionAction({
    payload: proposal.payload,
    candidateTransactions: input.candidateTransactions ?? [],
    possibleOwnAccountTransfer: input.possibleOwnAccountTransfer,
  });

  const policyInput: AutopilotPolicyInput = {
    coreConfidence: input.coreConfidence,
    categoryConfidence: input.categoryConfidence,
    validation,
    isReversible: true, // create_transaction always has a working undo path (autopilot-undo.ts)
    overridesManualData: false, // a brand-new transaction cannot override anyone's manual edit
  };
  const policyResult = decideAutopilotAction(policyInput);
  const categoryLabel = getCategoryById(proposal.payload.categoryId)?.label;
  const explanation = buildDeterministicExplanation({
    decision: policyResult.decision,
    evidence: policyResult.evidence,
    amountSatang: proposal.payload.amountSatang,
    categoryLabel,
  });

  if (policyResult.decision === "reject" || policyResult.decision === "require_confirmation") {
    await finalizeAutopilotActionRecord({
      userId,
      id: auditRecord.id,
      status: policyResult.decision === "reject" ? "rejected" : "validated",
      decision: policyResult.decision,
      explanation,
      validationErrors: policyResult.evidence.map((item) => item.reasonCode),
    });
    return {
      ok: policyResult.decision !== "reject" ? true : false,
      auditRecordId: auditRecord.id,
      decision: policyResult.decision,
      explanation,
      errors: policyResult.evidence.map((item) => item.reasonCode),
    };
  }

  // auto_execute or execute_with_notice: actually write the transaction.
  try {
    const categoryConfidenceValue =
      proposal.categoryConfidence ?? (input.categoryConfidence === "high" ? 0.9 : input.categoryConfidence === "medium" ? 0.6 : 0.3);
    const transaction = await createTransaction(userId, {
      type: proposal.payload.transactionType,
      amountSatang: proposal.payload.amountSatang,
      occurredAt: proposal.payload.occurredAt,
      merchant: proposal.payload.merchant,
      category: categoryLabel,
      note: proposal.payload.note,
      debtId: proposal.payload.debtId,
      source: "ai_extraction",
      documentId: proposal.sourceMetadata?.documentId,
    });
    // categorySource/categoryConfidence are provenance metadata (Part G) --
    // createTransaction's shared TransactionInput doesn't carry them
    // (every other caller has no concept of AI category provenance and
    // must not be forced to pass it), so they're applied in this focused
    // follow-up write via autopilot-provenance.ts instead.
    await setTransactionCategoryProvenance(userId, transaction.id, "ai", categoryConfidenceValue);

    const resultingState = snapshotTransaction({ ...transaction, category: categoryLabel });
    await finalizeAutopilotActionRecord({
      userId,
      id: auditRecord.id,
      status: "executed",
      decision: policyResult.decision,
      entityId: transaction.id,
      explanation,
      resultingState,
      undoPayload: { transactionId: transaction.id },
      executedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      auditRecordId: auditRecord.id,
      decision: policyResult.decision,
      explanation,
      transaction: { ...transaction, category: categoryLabel },
    };
  } catch (error) {
    // Never swallowed: recorded as a failed audit outcome AND rethrown so
    // the caller's own error handling still runs.
    await finalizeAutopilotActionRecord({
      userId,
      id: auditRecord.id,
      status: "failed",
      decision: policyResult.decision,
      explanation: "บันทึกรายการไม่สำเร็จ กรุณาลองใหม่",
      validationErrors: [error instanceof Error ? error.message : "unknown_error"],
    });
    throw error;
  }
}
