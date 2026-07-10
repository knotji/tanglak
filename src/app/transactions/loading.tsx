import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function TransactionsLoading() {
  return (
    <AppShell>
      <PageHeader title="รายการ" subtitle="กำลังโหลด" />
      <RouteSkeleton rows={5} />
    </AppShell>
  );
}
