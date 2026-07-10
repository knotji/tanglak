import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { PageHeader } from "@/components/PageHeader";

export default function DebtsLoading() {
  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="หนี้" subtitle="กำลังโหลดข้อมูลหนี้" />
        <button disabled className="min-h-11 shrink-0 rounded-[16px] bg-primary px-4 text-sm font-bold text-white opacity-60">
          + เพิ่มหนี้
        </button>
      </div>
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-10 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="h-14 animate-pulse rounded bg-muted" />
          <div className="h-14 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <RouteSkeleton rows={2} />
    </AppShell>
  );
}
