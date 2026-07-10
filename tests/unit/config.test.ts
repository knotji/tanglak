import { afterEach, describe, expect, it } from "vitest";
import { getSupabasePublicConfig, validateSupabaseConfig } from "@/lib/supabase/config";

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
    expect(getSupabasePublicConfig()).toMatchObject({
      url: "https://example.supabase.co",
      publicKey: "publishable",
      publicKeyName: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    });
  });

  it("accepts URL plus anon key", () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    };

    expect(validateSupabaseConfig().ok).toBe(true);
    expect(getSupabasePublicConfig()).toMatchObject({
      publicKey: "anon",
      publicKeyName: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    });
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

  it("rejects malformed Supabase URLs", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    };

    const status = validateSupabaseConfig();
    expect(status.ok).toBe(false);
    expect(status.message).toContain("NEXT_PUBLIC_SUPABASE_URL is malformed");
    expect(() => getSupabasePublicConfig()).toThrow("NEXT_PUBLIC_SUPABASE_URL is malformed");
  });
});
