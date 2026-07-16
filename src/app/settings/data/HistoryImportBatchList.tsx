"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteBatchAction, rollbackBatchAction } from "@/app/actions/history-import";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { formatThaiDateFull } from "@/lib/finance/date";
import type { ImportBatch } from "@/types/domain";

type ConfirmState = { kind: "delete" | "rollback"; batch: ImportBatch } | null;

export function HistoryImportBatchList({ batches }: { batches: ImportBatch[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState<ConfirmState>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  async function runConfirmedAction() {
    if (!confirming || confirmPending) return;
    setConfirmPending(true);
    const result =
      confirming.kind === "delete"
        ? await deleteBatchAction(confirming.batch.id)
        : await rollbackBatchAction(confirming.batch.id);
    setConfirmPending(false);
    setConfirming(null);
    if (result.ok) {
      showToast(result.message, "success");
      router.refresh();
      return;
    }
    showToast(result.message, "error");
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-foreground">ประวัติชุดข้อมูลเดิม</h3>
      {batches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
          ยังไม่มีประวัติการนำเข้าย้อนหลัง
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {batches.map((batch) => {
            const dateStr = formatThaiDateFull(batch.createdAt);
            const batchContext = `${batch.originalFilename || "ไฟล์นิรนาม"} ${dateStr}`;

            return (
              <div
                key={batch.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 text-xs shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-foreground truncate max-w-[70%]">
                    📁 {batch.originalFilename || "ไฟล์นิรนาม"}
                  </div>
                  <div
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      batch.status === "completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : batch.status === "needs_review"
                        ? "bg-amber-50 text-amber-700"
                        : batch.status === "rolled_back"
                        ? "bg-gray-100 text-gray-600"
                        : batch.status === "failed"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {batch.status === "completed"
                      ? "นำเข้าแล้ว"
                      : batch.status === "needs_review"
                      ? "ต้องตรวจสอบ"
                      : batch.status === "rolled_back"
                      ? "ย้อนกลับแล้ว"
                      : batch.status === "failed"
                      ? "ล้มเหลว"
                      : batch.status === "partially_imported"
                      ? "เสร็จสิ้นบางส่วน"
                      : "กำลังประมวลผล"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-1 text-[11px] text-text-secondary">
                  <div>ประเภท: {batch.sourceType}</div>
                  <div>วันที่อัปโหลด: {dateStr}</div>
                  <div>นำเข้าสำเร็จ: {batch.importedRows} รายการ</div>
                  <div>ข้าม/ซ้ำ: {batch.skippedRows} รายการ</div>
                  {batch.periodStart && (
                    <div className="col-span-2 text-primary font-medium">
                      ช่วงเวลา: {batch.periodStart} ถึง {batch.periodEnd}
                    </div>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-2">
                  {batch.status === "needs_review" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirming({ kind: "delete", batch })}
                        aria-label={`ลบชุดนำเข้า ${batchContext}`}
                        className="min-h-11 rounded bg-rose-50 px-3 py-1 font-semibold text-rose-600 hover:bg-rose-100"
                      >
                        ลบชุดนี้
                      </button>
                      <Link
                        href={`/history-import/${batch.id}/review`}
                        aria-label={`ตรวจสอบรายการชุดนำเข้า ${batchContext}`}
                        className="flex min-h-11 items-center rounded bg-amber-500 px-3 py-1 font-bold text-white hover:bg-amber-600"
                      >
                        ตรวจสอบรายการ
                      </Link>
                    </>
                  )}

                  {batch.status === "completed" && (
                    <>
                      <Link
                        href={`/history-import/${batch.id}/summary`}
                        aria-label={`ดูสรุปชุดนำเข้า ${batchContext}`}
                        className="flex min-h-11 items-center rounded bg-gray-100 px-3 py-1 font-semibold text-text-secondary hover:bg-gray-200"
                      >
                        ดูสรุปข้อมูล
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirming({ kind: "rollback", batch })}
                        aria-label={`ย้อนกลับ (Rollback) ชุดนำเข้า ${batchContext}`}
                        className="min-h-11 rounded bg-rose-500 px-3 py-1 font-bold text-white hover:bg-rose-600"
                      >
                        ย้อนกลับ (Rollback)
                      </button>
                    </>
                  )}

                  {batch.status === "partially_imported" && (
                    <>
                      <Link
                        href={`/history-import/${batch.id}/review`}
                        aria-label={`ตรวจต่อชุดนำเข้า ${batchContext}`}
                        className="flex min-h-11 items-center rounded bg-amber-500 px-3 py-1 font-bold text-white hover:bg-amber-600"
                      >
                        ตรวจต่อ
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirming({ kind: "rollback", batch })}
                        aria-label={`ย้อนกลับ (Rollback) ชุดนำเข้า ${batchContext}`}
                        className="min-h-11 rounded bg-rose-500 px-3 py-1 font-bold text-white hover:bg-rose-600"
                      >
                        ย้อนกลับ (Rollback)
                      </button>
                    </>
                  )}

                  {batch.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => setConfirming({ kind: "delete", batch })}
                      aria-label={`ลบทิ้งชุดนำเข้า ${batchContext}`}
                      className="min-h-11 rounded bg-rose-50 px-3 py-1 font-semibold text-rose-600 hover:bg-rose-100"
                    >
                      ลบทิ้ง
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        title={confirming?.kind === "delete" ? "ลบชุดนำเข้านี้?" : "ย้อนกลับชุดนำเข้านี้?"}
        body={
          confirming?.kind === "delete"
            ? `ลบชุดนำเข้า "${confirming.batch.originalFilename || "ไฟล์นิรนาม"}" ทิ้งถาวร ไม่สามารถกู้คืนได้`
            : confirming
            ? `ย้อนกลับชุดนำเข้า "${confirming.batch.originalFilename || "ไฟล์นิรนาม"}" จะลบรายการธุรกรรมที่เกิดจากการนำเข้านี้ทั้งหมดถาวร ไม่สามารถกู้คืนได้`
            : ""
        }
        confirmLabel={confirming?.kind === "delete" ? "ลบชุดนี้" : "ย้อนกลับ"}
        confirmPending={confirmPending}
        pendingLabel={confirming?.kind === "delete" ? "กำลังลบ..." : "กำลังย้อนกลับ..."}
        onCancel={() => {
          if (!confirmPending) setConfirming(null);
        }}
        onConfirm={() => {
          void runConfirmedAction();
        }}
      />
    </div>
  );
}
