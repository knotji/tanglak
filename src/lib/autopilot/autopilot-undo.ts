/**
 * Undo for autopilot-created transactions (Phase 1: create_transaction
 * only). Safety rules, in order:
 *   1. the audit record must belong to the requesting user
 *   2. it must be status "executed" (not already undone, not merely
 *      proposed/rejected -- there is nothing to undo in those states)
 *   3. the transaction it created must still exist and must be
 *      byte-for-byte unchanged (type/amount/occurredAt/merchant/category)
 *      from the snapshot taken right after execution -- if the user has
 *      edited it since, undo is refused rather than silently discarding
 *      their edit
 * This app has no existing soft-delete/archive pattern for transactions
 * (confirmed: deleteTransaction always hard-deletes, and the manual
 * "delete transaction" UI flow already uses it the same way) -- undo
 * reuses that same, already-tested delete path rather than introducing a
 * new archival mechanism for only this one code path.
 */

import { deleteTransaction, getTransactionById } from "@/lib/data/finance-repository";
import { finalizeAutopilotActionRecord, getAutopilotActionRecord } from "./autopilot-audit";
import type { AutopilotActionRecord, AutopilotTransactionSnapshot } from "./autopilot-types";

export type UndoAutopilotActionResult =
  | { ok: true; auditRecord: AutopilotActionRecord }
  | { ok: false; reason: "not_found" | "not_owner" | "not_executed" | "already_undone" | "transaction_modified" | "action_type_not_undoable" };

function snapshotsMatch(a: AutopilotTransactionSnapshot, b: AutopilotTransactionSnapshot): boolean {
  return (
    a.type === b.type &&
    a.amountSatang === b.amountSatang &&
    a.occurredAt === b.occurredAt &&
    (a.merchant ?? "") === (b.merchant ?? "") &&
    (a.category ?? "") === (b.category ?? "")
  );
}

export async function undoAutopilotAction(userId: string, auditRecordId: string): Promise<UndoAutopilotActionResult> {
  const record = await getAutopilotActionRecord(userId, auditRecordId);
  if (!record) return { ok: false, reason: "not_found" };
  if (record.userId !== userId) return { ok: false, reason: "not_owner" };

  if (record.status === "undone") return { ok: false, reason: "already_undone" };
  if (record.status !== "executed") return { ok: false, reason: "not_executed" };
  if (record.actionType !== "create_transaction" || !record.entityId) {
    return { ok: false, reason: "action_type_not_undoable" };
  }

  const transaction = await getTransactionById(userId, record.entityId);
  if (!transaction) {
    // Already gone (e.g. deleted through the normal transaction-delete
    // flow) -- there is nothing left to undo, but the action clearly
    // isn't "executed and reversible" anymore either.
    return { ok: false, reason: "not_executed" };
  }

  if (record.resultingState) {
    const currentSnapshot: AutopilotTransactionSnapshot = {
      type: transaction.type,
      amountSatang: transaction.amountSatang,
      occurredAt: transaction.occurredAt,
      merchant: transaction.merchant,
      category: transaction.category,
    };
    if (!snapshotsMatch(record.resultingState, currentSnapshot)) {
      return { ok: false, reason: "transaction_modified" };
    }
  }

  await deleteTransaction(userId, transaction.id);

  const updated = await finalizeAutopilotActionRecord({
    userId,
    id: record.id,
    status: "undone",
    explanation: "ยกเลิกรายการที่ระบบสร้างให้อัตโนมัติแล้ว",
    undoneAt: new Date().toISOString(),
  });

  return { ok: true, auditRecord: updated };
}
