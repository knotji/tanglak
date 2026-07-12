export type SupabaseConfigStatus = {
  ok: boolean;
  message?: string;
  missing: string[];
};

export type SupabasePublicConfigKeyName =
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

export type SupabasePublicConfig = {
  url: string;
  publicKey: string;
  publicKeyName: SupabasePublicConfigKeyName;
};

/**
 * Every NEXT_PUBLIC_* variable here is read through a static, literal
 * `process.env.NEXT_PUBLIC_X` expression -- never `process.env[key]` with a
 * variable key, and never via a loop over an array of key names. Next.js's
 * build-time env inlining (webpack/Turbopack DefinePlugin) can only rewrite
 * literal member-expression accesses like this into the client bundle; a
 * variable-keyed lookup is invisible to that inlining step, so the
 * browser's `process.env` stays empty for those keys at runtime even
 * though the server (real Node.js env) sees the actual values. That
 * divergence previously caused ConfigError to render two different trees
 * during hydration on any route where AppShell is reachable from a
 * "use client" component (e.g. the review page). Keeping these as literal
 * reads inside each function body (rather than hoisting to module-level
 * constants) also keeps validateSupabaseConfig/getSupabasePublicConfig
 * re-evaluating fresh on every call, which the config test suite relies on
 * (it reassigns `process.env` between test cases).
 *
 * Priority order (ANON_KEY checked before PUBLISHABLE_KEY) matches the
 * project's existing production key name and must not change -- either
 * name alone is sufficient, and neither is required in addition to the
 * other.
 */
function firstConfiguredPublicKey(): Pick<SupabasePublicConfig, "publicKey" | "publicKeyName"> | null {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey) return { publicKey: anonKey, publicKeyName: "NEXT_PUBLIC_SUPABASE_ANON_KEY" };

  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publishableKey) return { publicKey: publishableKey, publicKeyName: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" };

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const missing = url?.trim() ? [] : ["NEXT_PUBLIC_SUPABASE_URL"];
  const hasPublicKey = Boolean(firstConfiguredPublicKey());
  const allMissing = hasPublicKey
    ? [...missing]
    : [...missing, "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const isProduction = process.env.NODE_ENV === "production";
  const malformed = url && !isValidSupabaseUrl(url) ? ["NEXT_PUBLIC_SUPABASE_URL"] : [];
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
