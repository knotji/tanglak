import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFinancialDocument } from "@/lib/ai/gemini";
import { createSafeDiagnostic, logSafeError } from "@/lib/observability/safe-diagnostics";

const originalEnv = process.env;

describe("safe diagnostics", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("omits unknown and nested provider fields while keeping safe stage and code", () => {
    const diagnostic = createSafeDiagnostic({
      operation: "gemini.extractFinancialDocument",
      stage: "parse-response",
      provider: "gemini",
      modelName: "gemini-test",
      errorCode: "invalid_json",
      error: {
        name: "ProviderError",
        code: "provider_code",
        response: {
          salary: "45000",
          accountNumber: "1234567890",
          rawText: "private statement row",
        },
      },
      // @ts-expect-error proving unknown fields are not part of the allowlist.
      rawModelOutput: "salary 45000 account 1234",
    });

    const serialized = JSON.stringify(diagnostic);
    expect(diagnostic).toMatchObject({
      operation: "gemini.extractFinancialDocument",
      stage: "parse-response",
      provider: "gemini",
      modelName: "gemini-test",
      errorName: "ProviderError",
      errorCode: "invalid_json",
    });
    expect(serialized).not.toContain("45000");
    expect(serialized).not.toContain("1234567890");
    expect(serialized).not.toContain("private statement row");
    expect(serialized).not.toContain("rawModelOutput");
  });

  it("logs safe diagnostics without serializing provider errors wholesale", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logSafeError("Gemini extraction response parse failed", {
      operation: "gemini.extractFinancialDocument",
      stage: "parse-response",
      errorCode: "invalid_json",
      error: Object.assign(new Error("salary 45000 from raw model"), {
        response: { text: "account 1234 raw body" },
      }),
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(spy.mock.calls[0]);
    expect(serialized).toContain("parse-response");
    expect(serialized).toContain("invalid_json");
    expect(serialized).not.toContain("45000");
    expect(serialized).not.toContain("account 1234");
  });
});

describe("Gemini logging redaction", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("does not write raw Gemini response to logs when JSON parsing fails", async () => {
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: "test-key",
      GEMINI_MODEL: "gemini-test",
    };
    const rawGeminiText = "not json salary 45000 account 1234 Somchai";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: rawGeminiText }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      extractFinancialDocument({ mimeType: "image/png", base64: "fake-base64" }),
    ).rejects.toThrow();

    const serialized = JSON.stringify(spy.mock.calls);
    expect(serialized).toContain("Gemini extraction response parse failed");
    expect(serialized).toContain("parse-response");
    expect(serialized).toContain("gemini-test");
    expect(serialized).not.toContain(rawGeminiText);
    expect(serialized).not.toContain("45000");
    expect(serialized).not.toContain("account 1234");
    expect(serialized).not.toContain("Somchai");
  });

  it("does not include provider response bodies in thrown errors", async () => {
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: "test-key",
      GEMINI_MODEL: "gemini-test",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("provider body salary 45000 account 1234", { status: 500 }),
      ),
    );

    await expect(
      extractFinancialDocument({ mimeType: "image/png", base64: "fake-base64" }),
    ).rejects.toThrow("Gemini extraction failed: Status 500");
    await expect(
      extractFinancialDocument({ mimeType: "image/png", base64: "fake-base64" }),
    ).rejects.not.toThrow("salary 45000");
  });
});
