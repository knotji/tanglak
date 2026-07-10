export type SupabaseConfigStatus = {
  ok: boolean;
  message?: string;
  missing: string[];
};

const publicRequired = ["NEXT_PUBLIC_SUPABASE_URL"] as const;

const publicKeyOptions = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

export function validateSupabaseConfig(): SupabaseConfigStatus {
  const missing = publicRequired.filter((key) => !process.env[key]);
  const hasPublicKey = publicKeyOptions.some((key) => Boolean(process.env[key]));
  const allMissing = hasPublicKey
    ? [...missing]
    : [...missing, "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const isProduction = process.env.NODE_ENV === "production";

  return {
    ok: allMissing.length === 0,
    missing: allMissing,
    message:
      allMissing.length > 0
        ? isProduction
          ? "ตั้งค่า Supabase สำหรับแอปยังไม่ครบ กรุณาตรวจสอบการตั้งค่าระบบ"
          : `ตั้งค่า Supabase ยังไม่ครบ: ${allMissing.join(", ")}`
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
    anonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
  };
}
