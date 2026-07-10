import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function TodayLoading() {
  return (
    <AppShell>
      <PageHeader title="วันนี้" subtitle="กำลังโหลดข้อมูลวันนี้" />
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-10 w-44 animate-pulse rounded bg-muted" />
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="h-16 animate-pulse rounded bg-muted" />
          <div className="h-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <RouteSkeleton rows={2} />
    </AppShell>
  );
}
