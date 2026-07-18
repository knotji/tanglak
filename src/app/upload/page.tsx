import { AppShell } from "@/components/AppShell";
import { NextActionCard } from "@/components/NextActionCard";
import { PageHeader } from "@/components/PageHeader";
import { UploadClient } from "./UploadClient";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { listPendingReviewDocuments } from "@/lib/data/finance-repository";

export default async function UploadPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const pendingDocuments = await listPendingReviewDocuments(user.id);

  return (
    <AppShell>
      <PageHeader
        title="อัปโหลดสลิป"
        subtitle="เริ่มจากรายการของเดือนนี้ แล้วค่อยเพิ่มทีละรายการได้"
      />

      <UploadClient pendingDocuments={pendingDocuments} />

      <NextActionCard
        title="คุณเป็นคนยืนยันเสมอ"
        body="AI จะช่วยอ่าน แต่จะไม่บันทึกจนกว่าคุณจะตรวจ"
      />
    </AppShell>
  );
}
