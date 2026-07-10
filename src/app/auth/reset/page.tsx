import { AppShell } from "@/components/AppShell";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";
import { hasRecoverySession } from "@/lib/auth/session";

export default async function ResetPasswordPage() {
  const ready = await hasRecoverySession();

  return (
    <AppShell nav={false}>
      <div className="flex flex-1 flex-col justify-center gap-8 py-6">
        <header className="space-y-2 text-center">
          <p className="text-[13px] font-semibold text-primary">ตั้งหลัก</p>
          <h1 className="text-[22px] font-bold leading-tight text-foreground">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-sm leading-6 text-text-secondary">
            ข้อมูลการเงินของคุณ เป็นของคุณคนเดียว
          </p>
        </header>
        <ResetPasswordForm status={ready ? "ready" : "expired"} />
      </div>
    </AppShell>
  );
}
