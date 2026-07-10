import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function OnboardingLoading() {
  return (
    <AppShell nav={false}>
      <PageHeader title="เริ่มตั้งหลัก" subtitle="กำลังโหลด" />
      <RouteSkeleton rows={3} />
    </AppShell>
  );
}
