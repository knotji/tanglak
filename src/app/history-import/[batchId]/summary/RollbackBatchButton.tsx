"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rollbackBatchAction } from "@/app/actions/history-import";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/ToastProvider";

export function RollbackBatchButton({
  batchId,
  batchContext,
}: {
  batchId: string;
  batchContext: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function runRollback() {
    if (pending) return;
    setPending(true);
    const result = await rollbackBatchAction(batchId);
    setPending(false);
    setConfirming(false);
    if (result.ok) {
      showToast(result.message, "success");
      router.push("/settings/data");
      router.refresh();
      return;
    }
    showToast(result.message, "error");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`ย้อนกลับ (Rollback) ชุดนำเข้า ${batchContext}`}
        className="flex min-h-11 w-full items-center justify-center rounded-xl bg-rose-50 text-xs font-bold text-rose-600 hover:bg-rose-100"
      >
        ย้อนกลับชุดนำเข้านี้ (Rollback)
      </button>
      <ConfirmDialog
        open={confirming}
        title="ย้อนกลับชุดนำเข้านี้?"
        body={`ย้อนกลับชุดนำเข้า "${batchContext}" จะลบรายการธุรกรรมที่เกิดจากการนำเข้านี้ทั้งหมดถาวร ไม่สามารถกู้คืนได้`}
        confirmLabel="ย้อนกลับ"
        confirmPending={pending}
        pendingLabel="กำลังย้อนกลับ..."
        onCancel={() => {
          if (!pending) setConfirming(false);
        }}
        onConfirm={() => {
          void runRollback();
        }}
      />
    </>
  );
}
