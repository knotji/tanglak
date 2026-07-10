import { AppShell } from "@/components/AppShell";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { PageHeader } from "@/components/PageHeader";

export default function OverviewLoading() {
  return (
    <AppShell>
      <PageHeader title="ภาพรวม" subtitle="กำลังโหลดเดือนนี้" />
      <DelayedLoadingMessage message="กำลังสรุปภาพรวม..." />
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div aria-hidden="true">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="mt-3 h-10 w-48 rounded bg-muted" />
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="h-12 rounded bg-muted" />
            <div className="h-12 rounded bg-muted" />
            <div className="h-12 rounded bg-muted" />
          </div>
        </div>
      </div>
      <section aria-hidden="true" className="rounded-[16px] border border-border bg-white p-4">
        <div className="h-4 w-28 rounded bg-muted" />
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="mt-4 flex items-center justify-between gap-4">
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
          </div>
        ))}
      </section>
    </AppShell>
  );
}
