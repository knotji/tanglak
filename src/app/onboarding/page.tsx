import { saveOnboardingAction } from "@/app/actions/profile";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";

export default async function OnboardingPage() {
  await requireUser();

  return (
    <AppShell>
      <PageHeader title="เริ่มตั้งหลัก" subtitle="กรอกเท่าที่สะดวก ข้ามได้ถ้ายังไม่พร้อม" />
      <form action={saveOnboardingAction} className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">ชื่อที่อยากให้เรียก</span>
          <input name="displayName" className="min-h-11 w-full rounded-[16px] border border-border px-3" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">สกุลเงิน</span>
          <select name="preferredCurrency" className="min-h-11 w-full rounded-[16px] border border-border px-3" defaultValue="THB">
            <option value="THB">THB</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">เขตเวลา</span>
          <input name="timezone" defaultValue="Asia/Bangkok" className="min-h-11 w-full rounded-[16px] border border-border px-3" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">วันเงินเดือนออก</span>
          <input name="salaryDay" inputMode="numeric" placeholder="เช่น 30" className="min-h-11 w-full rounded-[16px] border border-border px-3" />
        </label>
        <fieldset className="rounded-[16px] bg-muted p-3 text-sm">
          <legend className="font-medium">เตือนก่อนครบกำหนด</legend>
          <label className="mt-2 flex min-h-11 items-center gap-2"><input name="reminder7" type="checkbox" defaultChecked /> 7 วันก่อน</label>
          <label className="flex min-h-11 items-center gap-2"><input name="reminder3" type="checkbox" defaultChecked /> 3 วันก่อน</label>
          <label className="flex min-h-11 items-center gap-2"><input name="reminder1" type="checkbox" defaultChecked /> 1 วันก่อน</label>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input name="wantsBudgetGuidance" type="checkbox" />
          อยากได้คำแนะนำแบ่งเงินรายเดือน
        </label>
        <button className="min-h-11 w-full rounded-[16px] bg-primary px-4 font-bold text-white">
          เริ่มใช้งาน
        </button>
      </form>
    </AppShell>
  );
}
