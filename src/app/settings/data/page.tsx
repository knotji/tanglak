import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { listImportBatches } from "@/lib/data/finance-repository";
import Link from "next/link";
import { HistoryImportBatchList } from "@/app/settings/data/HistoryImportBatchList";

export default async function HistoryImportSettingsPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  const batches = await listImportBatches(user.id);

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

        <HistoryImportBatchList batches={batches} />
      </div>
    </AppShell>
  );
}
