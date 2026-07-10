import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function DebtsLoading() {
  return (
    <AppShell>
      <PageHeader title="หนี้" subtitle="กำลังโหลด" />
      <RouteSkeleton rows={4} />
    </AppShell>
  );
}
