import { AppShell } from "@/components/AppShell";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { PageHeader } from "@/components/PageHeader";

export default function ReviewLoading() {
  return (
    <AppShell contentElement="div">
      <PageHeader title="ตรวจสอบรายการ" subtitle="กำลังอ่านข้อมูลสลิป" />
      <DelayedLoadingMessage message="กำลังอ่านข้อมูลสลิป..." />
      <div aria-hidden="true" className="space-y-3">
        <div className="h-48 rounded-[16px] bg-muted" />
        <div className="rounded-[16px] border border-border bg-surface p-4 space-y-3">
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="h-11 rounded-[12px] bg-muted" />
          <div className="h-4 w-1/4 rounded bg-muted" />
          <div className="h-11 rounded-[12px] bg-muted" />
        </div>
      </div>
    </AppShell>
  );
}
