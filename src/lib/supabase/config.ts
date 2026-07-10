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

export type SupabasePublicConfig = {
  url: string;
  publicKey: string;
  publicKeyName: (typeof publicKeyOptions)[number];
};

function firstConfiguredPublicKey(): Pick<SupabasePublicConfig, "publicKey" | "publicKeyName"> | null {
  for (const keyName of publicKeyOptions) {
    const value = process.env[keyName]?.trim();
    if (value) return { publicKey: value, publicKeyName: keyName };
  }
  return null;
}

function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function validateSupabaseConfig(): SupabaseConfigStatus {
  const missing = publicRequired.filter((key) => !process.env[key]?.trim());
  const hasPublicKey = Boolean(firstConfiguredPublicKey());
  const allMissing = hasPublicKey
    ? [...missing]
    : [...missing, "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const isProduction = process.env.NODE_ENV === "production";
  const malformed = process.env.NEXT_PUBLIC_SUPABASE_URL && !isValidSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    ? ["NEXT_PUBLIC_SUPABASE_URL"]
    : [];
  const issues = [...allMissing, ...malformed.map((key) => `${key} is malformed`)];

  return {
    ok: issues.length === 0,
    missing: issues,
    message:
      issues.length > 0
        ? isProduction
          ? "ตั้งค่า Supabase สำหรับแอปยังไม่ครบ กรุณาตรวจสอบการตั้งค่าระบบ"
          : `ตั้งค่า Supabase ยังไม่ครบ: ${issues.join(", ")}`
        : undefined,
  };
}

export function getSupabasePublicConfig() {
  const status = validateSupabaseConfig();
  if (!status.ok) {
    throw new Error(status.message);
  }
  const publicKey = firstConfiguredPublicKey();
  if (!publicKey) {
    throw new Error(status.message);
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: publicKey.publicKey,
    publicKey: publicKey.publicKey,
    publicKeyName: publicKey.publicKeyName,
  };
}
