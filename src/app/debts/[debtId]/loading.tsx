import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function DebtDetailLoading() {
  return (
    <AppShell>
      <PageHeader title="ประวัติการชำระ" subtitle="กำลังโหลด" />
      <RouteSkeleton rows={4} />
    </AppShell>
  );
}
