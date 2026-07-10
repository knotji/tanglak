import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function TodayLoading() {
  return (
    <AppShell>
      <PageHeader title="วันนี้" subtitle="กำลังโหลด" />
      <RouteSkeleton rows={4} />
    </AppShell>
  );
}
