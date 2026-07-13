import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { listRecentAutopilotActions } from "@/lib/autopilot/autopilot-audit";
import { AutopilotActivityList } from "./AutopilotActivityList";

export default async function AutopilotActivityPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  const actions = await listRecentAutopilotActions(user.id, 30);

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <PageHeader title="สิ่งที่ TangLak จัดการให้" subtitle="รายการที่ระบบสร้างหรือแก้ไขให้อัตโนมัติ พร้อมเหตุผลและปุ่มยกเลิก" />
        <AutopilotActivityList actions={actions} />
      </div>
    </AppShell>
  );
}
