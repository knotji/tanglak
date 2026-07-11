import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { listAccounts } from "@/lib/data/finance-repository";
import { HistoryImportClient } from "./HistoryImportClient";

export const runtime = "nodejs";

/**
 * Bank statement import is deprecated from TangLak's primary UX (see
 * docs/SLIP_FIRST_PRODUCT_DIRECTION.md) but the backend -- migrations,
 * parser, idempotency, rollback -- is intentionally preserved, and users
 * who already imported history keep full access to it. This route stays
 * reachable (bookmarks, direct links, the advanced settings entry) but
 * leads with a calm notice steering new activity toward the slip-first
 * flow instead of a raw "feature disabled" message.
 */
function LegacyImportNotice() {
  return (
    <section className="rounded-[16px] border border-border bg-surface p-4">
      <p className="text-sm font-bold text-foreground">การนำเข้ารายการจำนวนมากถูกพักไว้ชั่วคราว</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        แนะนำให้อัปโหลดสลิปหรือเพิ่มรายการทีละรายการ เพื่อเริ่มติดตามการเงินตั้งแต่เดือนนี้
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

  const accounts = await listAccounts(user.id);

  return (
    <AppShell>
      <PageHeader
        title="นำเข้าประวัติย้อนหลัง"
        subtitle="นำเข้าประวัติรายการจากธนาคารหรือบัตรเครดิตเพื่อวิเคราะห์ย้อนหลัง"
      />

      <LegacyImportNotice />

      <HistoryImportClient accounts={accounts} />
    </AppShell>
  );
}
