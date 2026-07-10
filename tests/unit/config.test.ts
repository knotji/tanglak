import { afterEach, describe, expect, it } from "vitest";
import { validateSupabaseConfig } from "@/lib/supabase/config";

describe("Supabase config validation", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts URL plus publishable key without service role", () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    };

    expect(validateSupabaseConfig().ok).toBe(true);
  });

  it("reports names but not secret values when missing", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    };

    const status = validateSupabaseConfig();
    expect(status.ok).toBe(false);
    expect(status.message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(status.message).not.toContain("service");
  });
});
