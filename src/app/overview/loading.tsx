import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function OverviewLoading() {
  return (
    <AppShell>
      <PageHeader title="ภาพรวม" subtitle="กำลังโหลดเดือนนี้" />
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-10 w-48 animate-pulse rounded bg-muted" />
      </div>
      <RouteSkeleton rows={3} />
    </AppShell>
  );
}
