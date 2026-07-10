import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const createServerClient = vi.fn(() => ({
  auth: { getUser },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

const originalEnv = process.env;

function request(path: string) {
  return new NextRequest(`https://app.example.test${path}`);
}

async function loadMiddleware() {
  vi.resetModules();
  return import("../../middleware");
}

describe("middleware Supabase configuration safety", () => {
  beforeEach(() => {
    createServerClient.mockClear();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });
    process.env = {
      ...originalEnv,
      E2E_MOCK_AUTH: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("uses anon-key configuration and keeps protected routes protected", async () => {
    const { middleware } = await loadMiddleware();

    const response = await middleware(request("/today"));

    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.any(Object),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/auth");
  });

  it("uses publishable-key configuration", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
    const { middleware } = await loadMiddleware();

    const response = await middleware(request("/transactions"));

    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "publishable-key",
      expect.any(Object),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/auth");
  });

  it("fails closed for protected routes when the public key is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    const { middleware } = await loadMiddleware();

    const response = await middleware(request("/upload"));

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/auth");
  });

  it("fails closed for protected routes when Supabase URL is malformed", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    const { middleware } = await loadMiddleware();

    const response = await middleware(request("/settings"));

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/auth");
  });

  it("preserves public auth and reset routes when configuration is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    const { middleware } = await loadMiddleware();

    const authResponse = await middleware(request("/auth"));
    const resetResponse = await middleware(request("/auth/reset"));

    expect(createServerClient).not.toHaveBeenCalled();
    expect(authResponse.status).toBe(200);
    expect(resetResponse.status).toBe(200);
  });
});
