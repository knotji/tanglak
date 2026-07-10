export type SupabaseConfigStatus = {
  ok: boolean;
  message?: string;
  missing: string[];
};

const publicRequired = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function validateSupabaseConfig(): SupabaseConfigStatus {
  const missing = publicRequired.filter((key) => !process.env[key]);
  return {
    ok: missing.length === 0,
    missing: [...missing],
    message:
      missing.length > 0
        ? "ยังไม่ได้ตั้งค่า Supabase สำหรับแอปนี้ เพิ่ม URL และ anon key ใน .env.local ก่อนใช้งาน"
        : undefined,
  };
}

export function getSupabasePublicConfig() {
  const status = validateSupabaseConfig();
  if (!status.ok) {
    throw new Error(status.message);
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}
