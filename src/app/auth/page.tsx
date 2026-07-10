import { AppShell } from "@/components/AppShell";
import { AuthForm } from "@/features/auth/AuthForm";

export default function AuthPage() {
  return (
    <AppShell nav={false}>
      <div className="flex flex-1 flex-col justify-center gap-8 py-6">
        <header className="space-y-2 text-center">
          <p className="text-[13px] font-semibold text-primary">ตั้งหลัก</p>
          <h1 className="text-[22px] font-bold leading-tight text-foreground">
            เห็นเงินชัด จัดหนี้เป็น ใช้ชีวิตต่อได้
          </h1>
        </header>
        <AuthForm />
      </div>
    </AppShell>
  );
}
