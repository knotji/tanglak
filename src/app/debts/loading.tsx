import { AppShell } from "@/components/AppShell";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { PageHeader } from "@/components/PageHeader";

export default function DebtsLoading() {
  return (
    <AppShell contentElement="div">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="หนี้" subtitle="กำลังโหลดข้อมูลหนี้" />
        <button disabled className="min-h-11 shrink-0 rounded-[16px] bg-primary px-4 text-sm font-bold text-white opacity-60">
          + เพิ่มหนี้
        </button>
      </div>
      <DelayedLoadingMessage message="กำลังอัปเดตยอดหนี้..." />
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div aria-hidden="true">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="mt-3 h-10 w-40 rounded bg-muted" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="h-14 rounded bg-muted" />
            <div className="h-14 rounded bg-muted" />
          </div>
        </div>
      </div>
      <section aria-hidden="true" className="space-y-3">
        {[0, 1].map((index) => (
          <div key={index} className="rounded-[16px] border border-border bg-surface p-4">
            <div className="flex justify-between gap-4">
              <div className="h-5 w-36 rounded bg-muted" />
              <div className="h-5 w-20 rounded bg-muted" />
            </div>
            <div className="mt-4 h-2 rounded-full bg-muted" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
