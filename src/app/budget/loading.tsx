import { AppShell } from "@/components/AppShell";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { PageHeader } from "@/components/PageHeader";

// Budget was the only primary bottom-nav tab without its own loading
// boundary (Today, Transactions, and Overview all have one) -- see Issue 6.
// Without this, a navigation to /budget has no Suspense boundary of its
// own, so it silently falls back to waiting with no visual feedback at all
// (the App Router keeps the previous page frozen on screen until the new
// one is ready) rather than showing a scoped skeleton. This mirrors the
// same AppShell-preserving, delayed-message pattern already used by the
// sibling tabs so the bottom navigation never disappears during the wait.
export default function BudgetLoading() {
  return (
    <AppShell contentElement="div">
      <PageHeader title="งบประมาณรายเดือน" subtitle="กำลังโหลดงบประมาณ" />
      <DelayedLoadingMessage message="กำลังสรุปงบเดือนนี้..." />
      <div aria-hidden="true" className="h-11 rounded-[16px] bg-muted" />
      <div aria-hidden="true" className="rounded-[16px] border border-border bg-surface p-4">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="mt-3 h-8 w-40 rounded bg-muted" />
      </div>
      <section aria-hidden="true" className="flex flex-col gap-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-[16px] border border-border bg-surface p-3">
            <div className="h-4 w-2/3 rounded bg-muted" />
            <div className="mt-3 h-2.5 rounded-full bg-muted" />
          </div>
        ))}
      </section>
    </AppShell>
  );
}
