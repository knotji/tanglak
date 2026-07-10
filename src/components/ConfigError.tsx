import { validateSupabaseConfig } from "@/lib/supabase/config";

export function ConfigError() {
  const status = validateSupabaseConfig();
  if (status.ok || process.env.NODE_ENV === "production") return null;

  return (
    <section className="rounded-[16px] border border-overdue/20 bg-surface p-4 text-sm shadow-[0_10px_24px_rgba(24,32,29,0.04)]">
      <p className="font-bold text-overdue">ตั้งค่า Supabase ยังไม่ครบ</p>
      <p className="mt-1 leading-6 text-text-secondary">{status.message}</p>
      <p className="mt-2 text-xs text-text-secondary">
        ขาด: {status.missing.join(", ")}
      </p>
    </section>
  );
}
