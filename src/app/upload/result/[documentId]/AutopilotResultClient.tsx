"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";
import { formatTHB } from "@/lib/finance/money";
import { undoAutopilotActionForUser } from "@/app/actions/autopilot";
import type { Transaction } from "@/types/domain";
import type { AutopilotActionRecord } from "@/lib/autopilot/autopilot-types";

export function AutopilotResultClient({
  transaction,
  auditRecord,
}: {
  transaction: Transaction;
  auditRecord: AutopilotActionRecord | null;
}) {
  const router = useRouter();
  const [isUndoing, setIsUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUndo = async () => {
    if (!auditRecord) return;
    setIsUndoing(true);
    setErrorMessage(null);
    const result = await undoAutopilotActionForUser(auditRecord.id);
    setIsUndoing(false);
    if (result.ok) {
      setUndone(true);
    } else {
      setErrorMessage(result.message);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <div className="rounded-[16px] border border-border bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <CheckCircle2 size={28} aria-hidden />
        </div>
        <p className="mt-4 text-lg font-bold">TangLak จัดการให้แล้ว</p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {auditRecord?.explanation ?? `บันทึกรายการ ${formatTHB(transaction.amountSatang)} แล้ว`}
        </p>

        <div className="mt-5 rounded-[12px] border border-border bg-white p-4 text-left">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">ยอดเงิน</span>
            <span className="text-sm font-bold">{formatTHB(transaction.amountSatang)}</span>
          </div>
          {transaction.merchant && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-text-secondary">ร้านค้า</span>
              <span className="text-sm font-semibold">{transaction.merchant}</span>
            </div>
          )}
          {transaction.category && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-text-secondary">หมวดหมู่</span>
              <span className="text-sm font-semibold">{transaction.category}</span>
            </div>
          )}
        </div>

        {undone ? (
          <p className="mt-4 text-xs font-semibold text-primary">ยกเลิกรายการเรียบร้อยแล้ว</p>
        ) : (
          auditRecord && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={isUndoing}
              aria-busy={isUndoing}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-[16px] border border-border bg-white py-3 text-sm font-bold text-foreground shadow-sm hover:bg-gray-50 disabled:opacity-60"
            >
              <Undo2 size={16} aria-hidden />
              {isUndoing ? "กำลังยกเลิก..." : "ยกเลิกรายการนี้"}
            </button>
          )
        )}
        {errorMessage && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
            {errorMessage}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Link
            href="/transactions"
            className="flex-1 rounded-[16px] bg-primary py-3 text-center text-sm font-bold text-white shadow-md hover:bg-primary-dark"
          >
            ดูรายการทั้งหมด
          </Link>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="flex-1 rounded-[16px] border border-border bg-white py-3 text-center text-sm font-bold shadow-sm hover:bg-gray-50"
          >
            อัปโหลดอีก
          </button>
        </div>
      </div>
    </div>
  );
}
