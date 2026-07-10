import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { getImportBatch, listImportRows } from "@/lib/data/finance-repository";
import { rollbackBatchAction } from "@/app/actions/history-import";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const runtime = "nodejs";

interface SummaryPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function HistoryImportSummaryPage({ params }: SummaryPageProps) {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  const { batchId } = await params;
  const batch = await getImportBatch(user.id, batchId);
  if (!batch) {
    notFound();
  }

  const rows = await listImportRows(user.id, batchId);

  // Statistics calculation
  const importedCount = rows.filter(r => r.importDecision === "import" && r.reviewStatus === "imported").length;
  const mergedCount = rows.filter(r => r.importDecision === "merge_existing" && r.reviewStatus === "imported").length;
  const skippedCount = rows.filter(r => r.importDecision === "skip" && r.reviewStatus === "skipped").length;
  const unresolvedCount = rows.filter(r => r.importDecision === "unresolved").length;

  let totalDepositSatang = 0;
  let totalWithdrawalSatang = 0;

  rows.forEach(r => {
    if (r.reviewStatus === "imported") {
      if (r.suggestedTransactionType === "income") {
        totalDepositSatang += r.amountSatang;
      } else if (r.suggestedTransactionType === "expense") {
        totalWithdrawalSatang += r.amountSatang;
      }
    }
  });

  async function handleRollback() {
    "use server";
    await rollbackBatchAction(batchId);
    redirect("/settings/data");
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5 animate-fade-in">
        <PageHeader
          title="สรุปผลการนำเข้า"
          subtitle="ประมวลผลธุรกรรมประวัติย้อนหลังเรียบร้อยแล้ว"
        />

        {/* Status card */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 text-center shadow-sm">
          <div className="text-3xl">🎉</div>
          <h3 className="mt-2 text-sm font-bold text-emerald-800">นำเข้าประวัติธุรกรรมสำเร็จ</h3>
          <p className="text-xs text-emerald-700/80 mt-1">
            ชุดข้อมูล: {batch.originalFilename}
          </p>
        </div>

        {/* Quantities Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <span className="block text-[10px] text-text-secondary">นำเข้าธุรกรรมใหม่</span>
            <span className="mt-1 block text-lg font-bold text-foreground">{importedCount} รายการ</span>
          </div>
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <span className="block text-[10px] text-text-secondary">จับคู่กับรายการเดิม</span>
            <span className="mt-1 block text-lg font-bold text-emerald-600">{mergedCount} รายการ</span>
          </div>
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <span className="block text-[10px] text-text-secondary">ข้ามรายการ</span>
            <span className="mt-1 block text-lg font-bold text-text-secondary">{skippedCount} รายการ</span>
          </div>
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <span className="block text-[10px] text-text-secondary">คงเหลือยังไม่ตรวจ</span>
            <span className="mt-1 block text-lg font-bold text-amber-600">{unresolvedCount} รายการ</span>
          </div>
        </div>

        {/* Financial Totals */}
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm flex flex-col gap-3">
          <h4 className="text-xs font-bold text-foreground border-b border-border pb-2">สรุปยอดทางการเงินที่นำเข้า</h4>
          <div className="flex justify-between items-center text-xs">
            <span className="text-text-secondary">ยอดฝากรวม (Deposits)</span>
            <span className="font-bold text-emerald-600">฿{(totalDepositSatang / 100).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-text-secondary">ยอดถอนรวม (Withdrawals)</span>
            <span className="font-bold text-foreground">฿{(totalWithdrawalSatang / 100).toLocaleString()}</span>
          </div>
        </div>

        {/* Actions Button Grid */}
        <div className="flex flex-col gap-2 mt-4">
          <Link
            href="/transactions"
            className="flex min-h-12 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-sm hover:bg-primary-dark"
          >
            ดูรายการธุรกรรมทั้งหมด
          </Link>

          <Link
            href="/overview"
            className="flex min-h-11 items-center justify-center rounded-xl bg-gray-100 text-xs font-semibold text-text-secondary hover:bg-gray-200"
          >
            กลับหน้าแรก / ภาพรวมหลัก
          </Link>

          {/* Rollback Options Form */}
          <div className="mt-4 border-t border-border pt-4 flex flex-col gap-2">
            <div className="text-[10px] text-text-secondary text-center leading-4">
              นำเข้าผิดพลาดหรืออัปโหลดไฟล์ซ้ำ? คุณสามารถย้อนคืนธุรกรรมทั้งหมดที่ถูกนำเข้าจาก Statement ชุดนี้ได้ทุกเมื่อ
            </div>
            <form action={handleRollback}>
              <button
                type="submit"
                className="flex min-h-11 w-full items-center justify-center rounded-xl bg-rose-50 text-xs font-bold text-rose-600 hover:bg-rose-100"
              >
                ย้อนกลับชุดนำเข้านี้ (Rollback)
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
