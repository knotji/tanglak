import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { timePage } from "@/lib/observability/timing";
import { getReleaseMetadata } from "@/lib/metadata/release";
import { formatThaiDateLabel } from "@/lib/finance/date";

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-bold text-text-secondary">{title}</h2>
      <div className="overflow-hidden rounded-[16px] border border-border bg-surface">{children}</div>
    </section>
  );
}

function SettingsLink({
  href,
  label,
  detail,
}: {
  href: string;
  label: string;
  detail?: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0 hover:bg-muted"
    >
      <span className="font-bold text-foreground">{label}</span>
      {detail ? <span className="text-right text-xs text-text-secondary">{detail}</span> : null}
    </Link>
  );
}

export default async function SettingsPage() {
  return timePage("/settings", async () => {
    const user = await requireUser();
    await requireCompletedOnboarding(user);

    const { version, releaseDate } = getReleaseMetadata();

    return (
      <AppShell>
        <PageHeader title="ตั้งค่า" subtitle={user.email ?? "บัญชีตั้งหลัก"} />

        <SettingsSection title="โปรไฟล์">
        <SettingsLink href="/onboarding?edit=1" label="แก้ไขโปรไฟล์และการเริ่มต้น" detail="ชื่อ สกุลเงิน เวลา เตือน" />
      </SettingsSection>

      <SettingsSection title="บัญชีและกระเป๋าเงิน">
        <SettingsLink href="/settings/accounts" label="บัญชีและกระเป๋าเงิน" detail="บัญชีหลัก เลขท้าย 4 หลัก" />
      </SettingsSection>

      <SettingsSection title="ข้อมูล">
        <SettingsLink href="/settings/autopilot-activity" label="สิ่งที่ TangLak จัดการให้" detail="รายการที่ระบบสร้างอัตโนมัติ" />
        <SettingsLink href="/settings/data" label="ข้อมูลที่เคยบันทึก" detail="ประวัติชุดข้อมูลเดิมและการย้อนกลับ" />
        <SettingsLink href="/upload" label="ประวัติอัปโหลดเอกสาร" detail="เอกสารส่วนตัวใน Storage" />
        <div className="px-4 py-3 text-sm leading-6 text-text-secondary">
          ไฟล์ถูกใช้เพื่ออ่านข้อมูลการเงินเท่านั้น ข้อมูลจาก AI ต้องให้คุณยืนยันก่อนบันทึก
          และตั้งหลักไม่เก็บกุญแจ service-role ในฝั่ง client
        </div>
      </SettingsSection>

      <SettingsSection title="ขั้นสูง">
        <SettingsLink href="/settings/data" label="ประวัติการนำเข้า" detail="สถานะไทยและ rollback" />
        <div className="px-4 py-3 text-sm leading-6 text-text-secondary">
          พื้นที่นี้เก็บประวัติชุดข้อมูลเดิมเพื่อการตรวจสอบและย้อนกลับเท่านั้น การใช้งานประจำวันให้สแกนสลิปหรือเพิ่มรายการเอง
        </div>
      </SettingsSection>

      <SettingsSection title="การแจ้งเตือน">
        <SettingsLink href="/onboarding?edit=1" label="วันเตือนที่ต้องการ" detail="แก้ไขได้จากโปรไฟล์" />
      </SettingsSection>

      <SettingsSection title="ความเป็นส่วนตัว">
        <div className="px-4 py-3 text-sm leading-6 text-text-secondary">
          รายการ หนี้ บัญชี และเอกสารถูกอ่านผ่าน session ของคุณและ RLS ของ Supabase เท่านั้น
        </div>
      </SettingsSection>

      <form action={signOutAction}>
        <button className="min-h-11 w-full rounded-[16px] bg-muted px-4 font-bold text-primary">
          ออกจากระบบ
        </button>
      </form>

      <section className="mt-8 flex flex-col items-center gap-1 text-[11px] text-text-secondary/60">
        <p>TangLak v{version}</p>
        <p>อัปเดตล่าสุดเมื่อ {formatThaiDateLabel(releaseDate)}</p>
      </section>
    </AppShell>
    );
  });
}
