import { AppShell } from "@/components/AppShell";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { PageHeader } from "@/components/PageHeader";

export default function TodayLoading() {
  return (
    <AppShell contentElement="div">
      <PageHeader title="วันนี้" subtitle="กำลังโหลดข้อมูลวันนี้" />
      <DelayedLoadingMessage message="กำลังโหลดข้อมูล..." />

      <section aria-label="กำลังโหลดข้อมูลวันนี้" className="rounded-[16px] border border-border bg-surface p-5">
        <div aria-hidden="true">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-10 w-44 animate-pulse rounded bg-muted" />
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="h-16 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </section>

      <section aria-hidden="true" className="rounded-[16px] border border-border bg-surface p-4 shadow-sm">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-10 animate-pulse rounded-[12px] bg-muted" />
      </section>

      <section aria-hidden="true" className="space-y-3">
        <div className="h-4 w-36 animate-pulse rounded bg-muted" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-[14px] border border-border bg-surface p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </section>
    </AppShell>
  );
}
