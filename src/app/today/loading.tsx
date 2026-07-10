import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

export default function Loading() {
  return (
    <AppShell>
      <PageHeader title="วันนี้" subtitle="กำลังโหลดข้อมูล..." />
      <div className="h-52 animate-pulse rounded-[16px] bg-muted" />
      <div className="h-36 animate-pulse rounded-[16px] bg-muted" />
    </AppShell>
  );
}
