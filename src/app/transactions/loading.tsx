import { AppShell } from "@/components/AppShell";
import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
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
      <div className="flex gap-2">
        {["ทั้งหมด", "รายจ่าย", "รายรับ"].map((label) => (
          <span key={label} className="rounded-full bg-muted px-3 py-2 text-xs font-bold text-text-secondary">
            {label}
          </span>
        ))}
      </div>
      <RouteSkeleton rows={3} />
    </AppShell>
  );
}
