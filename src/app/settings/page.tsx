import { signOutAction } from "@/app/actions/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import Link from "next/link";

export default async function SettingsPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  return (
    <AppShell>
      <PageHeader title="ตั้งค่า" subtitle={user.email ?? "บัญชีตั้งหลัก"} />
      <section className="rounded-[16px] border border-border bg-surface p-4 text-sm leading-6 text-text-secondary">
        ไฟล์ถูกใช้เพื่ออ่านข้อมูลการเงินเท่านั้น ข้อมูลจาก AI ต้องให้คุณยืนยันก่อนบันทึก
        ตั้งหลักไม่ใช่ธนาคาร และไม่รับประกันผลลัพธ์ทางการเงิน
      </section>

      <div className="flex flex-col gap-2">
        <Link
          href="/settings/data"
          className="flex items-center justify-between min-h-12 w-full rounded-[16px] border border-border bg-white px-4 text-sm font-bold text-foreground hover:bg-muted"
        >
          <span>ข้อมูลและการนำเข้า</span>
          <span className="text-text-secondary text-xs font-normal">ประวัติธุรกรรมย้อนหลัง ➔</span>
        </Link>
      </div>

      <form action={signOutAction} className="mt-4">
        <button className="min-h-11 w-full rounded-[16px] bg-muted px-4 font-bold text-primary">
          ออกจากระบบ
        </button>
      </form>
    </AppShell>
  );
}
