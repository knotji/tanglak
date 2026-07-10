import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { listAccounts } from "@/lib/data/finance-repository";
import { HistoryImportClient } from "./HistoryImportClient";

export const runtime = "nodejs";

export default async function HistoryImportUploadPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);

  const accounts = await listAccounts(user.id);

  return (
    <AppShell>
      <PageHeader
        title="นำเข้าประวัติย้อนหลัง"
        subtitle="นำเข้าประวัติรายการจากธนาคารหรือบัตรเครดิตเพื่อวิเคราะห์ย้อนหลัง"
      />
      
      <HistoryImportClient accounts={accounts} />
    </AppShell>
  );
}
