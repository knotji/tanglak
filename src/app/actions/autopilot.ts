"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { undoAutopilotAction } from "@/lib/autopilot/autopilot-undo";
import { listRecentAutopilotActions, getAutopilotActionRecord } from "@/lib/autopilot/autopilot-audit";
import type { AutopilotActionRecord } from "@/lib/autopilot/autopilot-types";

export type UndoActionState = { ok: boolean; message: string };

const UNDO_FAILURE_MESSAGES: Record<string, string> = {
  not_found: "ไม่พบรายการที่ต้องการยกเลิก",
  not_owner: "ไม่มีสิทธิ์ยกเลิกรายการนี้",
  not_executed: "รายการนี้ไม่สามารถยกเลิกได้",
  already_undone: "ยกเลิกรายการนี้ไปแล้ว",
  transaction_modified: "รายการถูกแก้ไขไปแล้วหลังจากสร้าง จึงไม่สามารถยกเลิกอัตโนมัติได้ กรุณาแก้ไขรายการด้วยตนเอง",
  action_type_not_undoable: "รายการนี้ไม่รองรับการยกเลิก",
};

export async function undoAutopilotActionForUser(auditRecordId: string): Promise<UndoActionState> {
  const user = await requireUser();
  const result = await undoAutopilotAction(user.id, auditRecordId);
  if (!result.ok) {
    return { ok: false, message: UNDO_FAILURE_MESSAGES[result.reason] ?? "ยกเลิกไม่สำเร็จ" };
  }
  revalidatePath("/transactions");
  revalidatePath("/today");
  return { ok: true, message: "ยกเลิกรายการที่ระบบสร้างให้เรียบร้อยแล้ว" };
}

export async function getAutopilotActionForUser(auditRecordId: string): Promise<AutopilotActionRecord | null> {
  const user = await requireUser();
  return getAutopilotActionRecord(user.id, auditRecordId);
}

export async function listRecentAutopilotActivity(limit = 10): Promise<AutopilotActionRecord[]> {
  const user = await requireUser();
  return listRecentAutopilotActions(user.id, limit);
}
