import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function SettingsLoading() {
  return (
    <AppShell>
      <PageHeader title="ตั้งค่า" subtitle="กำลังโหลด" />
      <RouteSkeleton rows={4} />
    </AppShell>
  );
}
