import { AppShell } from "@/components/AppShell";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { PageHeader } from "@/components/PageHeader";

export default function UploadLoading() {
  return (
    <AppShell contentElement="div">
      <PageHeader title="อัปโหลดสลิป" subtitle="กำลังโหลดหน้าสแกนสลิป" />
      <DelayedLoadingMessage message="กำลังเตรียมพื้นที่อัปโหลดสลิป..." />
      <section aria-hidden="true" className="rounded-[16px] border border-border bg-surface p-4">
        <div className="h-36 rounded-[16px] bg-muted" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="h-11 rounded-[16px] bg-muted" />
          <div className="h-11 rounded-[16px] bg-muted" />
        </div>
      </section>
    </AppShell>
  );
}
