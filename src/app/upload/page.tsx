import { AppShell } from "@/components/AppShell";
import { NextActionCard } from "@/components/NextActionCard";
import { PageHeader } from "@/components/PageHeader";
import { UploadClient } from "./UploadClient";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import Link from "next/link";

export default async function UploadPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  return (
    <AppShell>
      <PageHeader
        title="ส่งหลักฐานมาให้ตั้งหลักอ่าน"
        subtitle="สลิป ใบเสร็จ หรือ Statement คุณตรวจได้ทุกอย่างก่อนบันทึก"
      />
      
      <UploadClient />

      <div className="my-4 text-center text-sm">
        <Link href="/history-import" className="font-bold text-primary hover:underline">
          มี Statement หลายรายการ? นำเข้าประวัติย้อนหลัง ➔
        </Link>
      </div>

      <NextActionCard
        title="คุณเป็นคนยืนยันเสมอ"
        body="AI จะช่วยอ่าน แต่จะไม่บันทึกจนกว่าคุณจะตรวจ"
      />
    </AppShell>
  );
}
