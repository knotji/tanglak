import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { getImportBatch, listImportRows, listDebts } from "@/lib/data/finance-repository";
import { ReviewBoardClient } from "./ReviewBoardClient";
import { notFound } from "next/navigation";

interface ReviewPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function HistoryImportReviewPage({ params }: ReviewPageProps) {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  const { batchId } = await params;

  const batch = await getImportBatch(user.id, batchId);
  if (!batch) {
    notFound();
  }

  const rows = await listImportRows(user.id, batchId);
  const debts = await listDebts(user.id, true);

  return (
    <AppShell>
      <PageHeader
        title="ตรวจสอบชุดข้อมูล"
        subtitle="ตรวจรายการที่ถูกดึงมาจาก Statement เลือกวิธีนำเข้าหรือจัดกลุ่มก่อนบันทึกจริง"
      />
      
      <ReviewBoardClient batch={batch} initialRows={rows} debts={debts} />
    </AppShell>
  );
}
