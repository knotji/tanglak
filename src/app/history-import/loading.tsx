import { AppShell } from "@/components/AppShell";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { PageHeader } from "@/components/PageHeader";

export default function HistoryImportLoading() {
  return (
    <AppShell contentElement="div">
      <PageHeader title="เพิ่มข้อมูลการเงิน" subtitle="กำลังโหลดตัวเลือกการบันทึกข้อมูล" />
      <DelayedLoadingMessage message="กำลังเตรียมตัวเลือกที่ตรวจสอบได้..." />
      <section aria-hidden="true" className="rounded-[16px] border border-border bg-surface p-4">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="mt-3 h-4 w-full rounded bg-muted" />
        <div className="mt-4 flex gap-2">
          <div className="h-11 w-28 rounded-[16px] bg-muted" />
          <div className="h-11 w-32 rounded-[16px] bg-muted" />
        </div>
      </section>
    </AppShell>
  );
}
