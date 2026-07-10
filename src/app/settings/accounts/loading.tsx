import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function AccountsLoading() {
  return (
    <AppShell>
      <PageHeader title="บัญชีและกระเป๋าเงิน" subtitle="กำลังโหลด" />
      <RouteSkeleton rows={3} />
    </AppShell>
  );
}
