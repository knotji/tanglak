import { AppShell } from "@/components/AppShell";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { PageHeader } from "@/components/PageHeader";

export default function TransactionsLoading() {
  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="รายการ" subtitle="กำลังโหลดเดือนนี้" />
        <button disabled className="min-h-11 shrink-0 rounded-[16px] bg-primary px-4 text-sm font-bold text-white opacity-60">
          + เพิ่มรายการ
        </button>
      </div>
      <DelayedLoadingMessage message="กำลังดึงรายการล่าสุด..." />
      <div className="flex gap-2">
        {["ทั้งหมด", "รายจ่าย", "รายรับ"].map((label) => (
          <span key={label} className="rounded-full bg-muted px-3 py-2 text-xs font-bold text-text-secondary">
            {label}
          </span>
        ))}
      </div>
      <section aria-hidden="true" className="space-y-4">
        {[0, 1, 2].map((group) => (
          <div key={group} className="space-y-2">
            <div className="h-4 w-24 rounded bg-muted" />
            {[0, 1].map((row) => (
              <div key={row} className="rounded-[14px] border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-3/4 rounded bg-muted" />
                    <div className="mt-3 h-3 w-32 rounded bg-muted" />
                  </div>
                  <div className="h-5 w-20 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
    </AppShell>
  );
}
