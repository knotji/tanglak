import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFinancialDocument } from "@/lib/ai/gemini";
import { classifySchemaValidationError } from "@/lib/ai/extraction-errors";
import { ZodError } from "zod";

const originalEnv = process.env;

function mockGeminiResponse(json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
}

describe("gemini.ts timestamp normalization (end-to-end raw payload -> parsed result)", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("normalizes a raw printed-format receipt timestamp into a correct extracted ISO value", async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" };
    mockGeminiResponse({
      documentType: "receipt",
      confidence: 0.9,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        occurredAt: "11 Jul 26 07:26 +0700",
        merchant: "Seven-Eleven",
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });

    const result = await extractFinancialDocument({ mimeType: "image/png", base64: "fake" });
    expect(result.transaction?.occurredAt).toBe("2026-07-11T07:26:00+07:00");
  });

  it("does not double-convert a timestamp that already carries an explicit non-Bangkok offset", async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" };
    mockGeminiResponse({
      documentType: "receipt",
      confidence: 0.9,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        occurredAt: "11 Jul 26 07:26 +0900",
        merchant: "Seven-Eleven",
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });

    const result = await extractFinancialDocument({ mimeType: "image/png", base64: "fake" });
    expect(result.transaction?.occurredAt).toBe("2026-07-11T07:26:00+09:00");
  });

  it("strips an unparseable timestamp candidate, marks it as needing review, and never guesses the current time", async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" };
    mockGeminiResponse({
      documentType: "receipt",
      confidence: 0.9,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        occurredAt: "not a real timestamp",
        merchant: "Seven-Eleven",
      },
      receipt: { totalPaid: 189 },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });

    // A missing/invalid occurredAt no longer fails extraction outright --
    // it's a draft review issue, and every other field stays usable.
    const result = await extractFinancialDocument({ mimeType: "image/png", base64: "fake" });
    expect(result.transaction?.occurredAt).toBeUndefined();
    expect(result.unclearFields).toContain("transaction.occurredAt");
    expect(result.transaction?.amount).toBe(189);
    expect(result.transaction?.type).toBe("expense");
    expect(result.transaction?.merchant).toBe("Seven-Eleven");
  });

  it("strips a locale-ambiguous numeric date, marks it as needing review, rather than silently guessing an interpretation", async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" };
    mockGeminiResponse({
      documentType: "receipt",
      confidence: 0.9,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        occurredAt: "07/11/2026",
        merchant: "Seven-Eleven",
      },
      receipt: { totalPaid: 189 },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });

    const result = await extractFinancialDocument({ mimeType: "image/png", base64: "fake" });
    expect(result.transaction?.occurredAt).toBeUndefined();
    expect(result.unclearFields).toContain("transaction.occurredAt");
    expect(result.transaction?.amount).toBe(189);
  });

  it("routes an entirely missing occurredAt to needing review instead of failing extraction (behavior change from the audit fix)", async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" };
    mockGeminiResponse({
      documentType: "receipt",
      confidence: 0.9,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        merchant: "Seven-Eleven",
      },
      receipt: { totalPaid: 189 },
      warnings: [],
      unclearFields: ["transaction.occurredAt"],
      requiresReview: true,
    });

    const result = await extractFinancialDocument({ mimeType: "image/png", base64: "fake" });
    expect(result.transaction?.occurredAt).toBeUndefined();
    expect(result.unclearFields).toContain("transaction.occurredAt");
  });

  it("still preserves an already-clean ISO timestamp exactly (no regression for the common case)", async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" };
    mockGeminiResponse({
      documentType: "transfer_slip",
      confidence: 0.9,
      transaction: {
        type: "transfer",
        amount: 1500,
        currency: "THB",
        occurredAt: "2026-07-10T13:00:00+07:00",
        merchant: "KTC Test",
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });

    const result = await extractFinancialDocument({ mimeType: "image/png", base64: "fake" });
    expect(result.transaction?.occurredAt).toBe("2026-07-10T13:00:00+07:00");
  });

  it("does not change amount/type/category validation behavior from the metadata fix", async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" };
    mockGeminiResponse({
      documentType: "receipt",
      confidence: 0.9,
      transaction: {
        occurredAt: "11 Jul 26 07:26 +0700",
        merchant: "Seven-Eleven",
        // amount and type intentionally omitted
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });

    try {
      await extractFinancialDocument({ mimeType: "image/png", base64: "fake" });
      throw new Error("expected rejection");
    } catch (error) {
      const classified =
        error instanceof ZodError
          ? classifySchemaValidationError(error)
          : (error as { missingFields?: string[] });
      // The timestamp itself parsed fine (extracted); the still-missing
      // amount/type fields are what's reported, unchanged from a804475.
      expect(classified.missingFields).toEqual(
        expect.arrayContaining(["transaction.amount", "transaction.type"]),
      );
      expect(classified.missingFields).not.toContain("transaction.occurredAt");
    }
  });
});
