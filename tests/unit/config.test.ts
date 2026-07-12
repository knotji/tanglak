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

  it("reports not configured when only the URL is missing (both public keys present)", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    };

    const status = validateSupabaseConfig();
    expect(status.ok).toBe(false);
    expect(status.missing).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("reports not configured when both public key options are missing (URL present)", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    };

    const status = validateSupabaseConfig();
    expect(status.ok).toBe(false);
    expect(status.missing).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("a server-only service-role key never satisfies public config on its own", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
    };

    const status = validateSupabaseConfig();
    expect(status.ok).toBe(false);
    // The service-role key must never appear in the reported status, even
    // as a "missing" entry name -- it isn't a public config variable at all.
    expect(status.missing.join(",")).not.toContain("SERVICE_ROLE");
    expect(status.message ?? "").not.toContain("SERVICE_ROLE");
    expect(status.message ?? "").not.toContain("service-role-secret-value");
    expect(() => getSupabasePublicConfig()).toThrow();
  });

  it("is deterministic across repeated calls with the same environment", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    };

    const first = validateSupabaseConfig();
    const second = validateSupabaseConfig();
    const third = validateSupabaseConfig();
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("the config status is a plain, JSON-serializable object (safe to pass across a server/client boundary)", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    };

    const status = validateSupabaseConfig();
    const roundTripped = JSON.parse(JSON.stringify(status));
    expect(roundTripped).toEqual(status);
  });

  it("never includes a service-role key value in the resolved public config", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
    };

    const config = getSupabasePublicConfig();
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("service-role-secret-value");
    expect(serialized).not.toContain("SERVICE_ROLE");
  });
});
