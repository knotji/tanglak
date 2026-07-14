import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { listImportBatches } from "@/lib/data/finance-repository";
import Link from "next/link";
import { deleteBatchAction, rollbackBatchAction } from "@/app/actions/history-import";
import { redirect } from "next/navigation";
import { formatThaiDateFull } from "@/lib/finance/date";

export default async function HistoryImportSettingsPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  const batches = await listImportBatches(user.id);

  async function handleRollback(formData: FormData) {
    "use server";
    const batchId = formData.get("batchId") as string;
    if (batchId) {
      await rollbackBatchAction(batchId);
      redirect("/settings/data");
    }
  }

  async function handleDelete(formData: FormData) {
    "use server";
    const batchId = formData.get("batchId") as string;
    if (batchId) {
      await deleteBatchAction(batchId);
      redirect("/settings/data");
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="ข้อมูลที่เคยบันทึก"
          subtitle="ประวัติชุดข้อมูลเดิมที่ยังต้องตรวจสอบหรือย้อนกลับได้"
        />

        <Link
          href="/settings"
          className="text-xs font-semibold text-text-secondary hover:underline"
        >
          ← กลับไปหน้าตั้งค่า
        </Link>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/upload"
            className="flex min-h-11 items-center rounded-[16px] bg-primary px-4 text-sm font-bold text-white"
          >
            อัปโหลดสลิป
          </Link>
          <Link
            href="/transactions"
            className="flex min-h-11 items-center rounded-[16px] border border-border bg-surface px-4 text-sm font-bold text-primary"
          >
            เพิ่มรายการเอง
          </Link>
        </div>

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
                          <form action={handleDelete}>
                            <input type="hidden" name="batchId" value={batch.id} />
                            <button
                              type="submit"
                              aria-label={`ลบชุดนำเข้า ${batchContext}`}
                              className="min-h-11 rounded bg-rose-50 px-3 py-1 font-semibold text-rose-600 hover:bg-rose-100"
                            >
                              ลบชุดนี้
                            </button>
                          </form>
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
                          <form action={handleRollback}>
                            <input type="hidden" name="batchId" value={batch.id} />
                            <button
                              type="submit"
                              aria-label={`ย้อนกลับ (Rollback) ชุดนำเข้า ${batchContext}`}
                              className="min-h-11 rounded bg-rose-500 px-3 py-1 font-bold text-white hover:bg-rose-600"
                            >
                              ย้อนกลับ (Rollback)
                            </button>
                          </form>
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
                          <form action={handleRollback}>
                            <input type="hidden" name="batchId" value={batch.id} />
                            <button
                              type="submit"
                              aria-label={`ย้อนกลับ (Rollback) ชุดนำเข้า ${batchContext}`}
                              className="min-h-11 rounded bg-rose-500 px-3 py-1 font-bold text-white hover:bg-rose-600"
                            >
                              ย้อนกลับ (Rollback)
                            </button>
                          </form>
                        </>
                      )}

                      {batch.status === "failed" && (
                        <form action={handleDelete}>
                          <input type="hidden" name="batchId" value={batch.id} />
                          <button
                            type="submit"
                            aria-label={`ลบทิ้งชุดนำเข้า ${batchContext}`}
                            className="min-h-11 rounded bg-rose-50 px-3 py-1 font-semibold text-rose-600 hover:bg-rose-100"
                          >
                            ลบทิ้ง
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
