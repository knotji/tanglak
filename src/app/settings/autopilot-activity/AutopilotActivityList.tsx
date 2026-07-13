"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { formatTHB } from "@/lib/finance/money";
import { formatThaiDateTimeLabel } from "@/lib/finance/date";
import { undoAutopilotActionForUser } from "@/app/actions/autopilot";
import type { AutopilotActionRecord } from "@/lib/autopilot/autopilot-types";

const ACTION_TYPE_LABEL_TH: Record<string, string> = {
  create_transaction: "สร้างรายการ",
  update_transaction_category: "แก้ไขหมวดหมู่",
  mark_internal_transfer: "ทำเครื่องหมายเงินโอนภายใน",
  ignore_duplicate_candidate: "ข้ามรายการที่อาจซ้ำ",
};

const STATUS_LABEL_TH: Record<string, string> = {
  proposed: "กำลังตรวจสอบ",
  validated: "รอการยืนยัน",
  executed: "ทำสำเร็จแล้ว",
  rejected: "ถูกปฏิเสธ",
  failed: "ล้มเหลว",
  undone: "ยกเลิกแล้ว",
};

function ActivityRow({ action }: { action: AutopilotActionRecord }) {
  const [isUndoing, setIsUndoing] = useState(false);
  const [localStatus, setLocalStatus] = useState(action.status);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canUndo = localStatus === "executed" && action.actionType === "create_transaction";

  const handleUndo = async () => {
    setIsUndoing(true);
    setErrorMessage(null);
    const result = await undoAutopilotActionForUser(action.id);
    setIsUndoing(false);
    if (result.ok) {
      setLocalStatus("undone");
    } else {
      setErrorMessage(result.message);
    }
  };

  const timeLabel = formatThaiDateTimeLabel(action.executedAt ?? action.createdAt) ?? action.createdAt;
  const snapshot = action.resultingState;

  return (
    <li className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {ACTION_TYPE_LABEL_TH[action.actionType] ?? action.actionType}
            {snapshot?.amountSatang !== undefined ? ` ${formatTHB(snapshot.amountSatang)}` : ""}
          </p>
          {snapshot?.merchant && <p className="mt-0.5 text-xs text-text-secondary">{snapshot.merchant}</p>}
          {action.explanation && <p className="mt-1 text-xs leading-5 text-text-secondary">{action.explanation}</p>}
          <p className="mt-1 text-[11px] text-text-secondary">{timeLabel}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-bold text-text-secondary">
          {STATUS_LABEL_TH[localStatus] ?? localStatus}
        </span>
      </div>

      {canUndo && (
        <button
          type="button"
          onClick={handleUndo}
          disabled={isUndoing}
          aria-busy={isUndoing}
          className="mt-2 flex items-center gap-1.5 rounded-[12px] border border-border bg-white px-3 py-1.5 text-xs font-bold text-foreground hover:bg-gray-50 disabled:opacity-60"
        >
          <Undo2 size={13} aria-hidden />
          {isUndoing ? "กำลังยกเลิก..." : "ยกเลิก"}
        </button>
      )}
      {errorMessage && (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
          {errorMessage}
        </p>
      )}
    </li>
  );
}

export function AutopilotActivityList({ actions }: { actions: AutopilotActionRecord[] }) {
  if (actions.length === 0) {
    return (
      <div className="rounded-[16px] border border-border bg-surface p-6 text-center text-sm text-text-secondary">
        ยังไม่มีรายการที่ระบบจัดการให้อัตโนมัติ
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-[16px] border border-border bg-surface">
      {actions.map((action) => (
        <ActivityRow key={action.id} action={action} />
      ))}
    </ul>
  );
}
