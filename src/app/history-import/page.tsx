import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";

export const runtime = "nodejs";

/**
 * The old bulk history upload is no longer a product-facing feature. The
 * backend parser/idempotency/rollback code remains for compatibility with
 * existing historical batches, but this route no longer offers a new form.
 */
function LegacyImportNotice() {
  return (
    <section className="rounded-[16px] border border-border bg-surface p-4">
      <p className="text-sm font-bold text-foreground">การนำเข้ารายการย้อนหลังถูกนำออกจากหน้าผลิตภัณฑ์แล้ว</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        ตั้งหลักตอนนี้เน้นการสแกนสลิป เพิ่มรายการเอง เพิ่มหนี้ และบันทึกการชำระ เพื่อให้ข้อมูลที่ใช้จริงตรวจสอบได้ทีละรายการ
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
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
        <Link
          href="/today"
          className="flex min-h-11 items-center rounded-[16px] border border-border bg-surface px-4 text-sm font-bold text-primary"
        >
          กลับหน้าวันนี้
        </Link>
      </div>
    </section>
  );
}

export default async function HistoryImportUploadPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  return (
    <AppShell>
      <PageHeader
        title="เพิ่มข้อมูลการเงิน"
        subtitle="เลือกวิธีที่ตรวจสอบได้ก่อนบันทึกจริง"
      />

      <LegacyImportNotice />
    </AppShell>
  );
}
