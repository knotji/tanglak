import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function OverviewLoading() {
  return (
    <AppShell>
      <PageHeader title="ภาพรวม" subtitle="กำลังโหลด" />
      <RouteSkeleton rows={4} />
    </AppShell>
  );
}
