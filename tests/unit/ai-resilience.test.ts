import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractFinancialDocument } from "@/lib/ai/gemini";
import { processAndExtractDocument } from "@/lib/ai/extract-document";
import {
  claimDocumentForProcessing,
  completeDocumentProcessing,
  createDocument,
  createDocumentExtraction,
  DOCUMENT_PROCESSING_LEASE_MS,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
  };
});

const originalEnv = process.env;

function validGeminiBody() {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                documentType: "receipt",
                transaction: {
                  type: "expense",
                  amount: 120,
                  currency: "THB",
                  occurredAt: "2026-07-10T12:00:00+07:00",
                  merchant: "Seven-Eleven",
                },
              }),
            },
          ],
        },
      },
    ],
  });
}

describe("AI provider resilience", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" };
    vi.restoreAllMocks();
  });

  it("aborts provider requests on timeout", async () => {
    let aborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init?: RequestInit) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise(() => undefined);
      }),
    );

    await expect(
      extractFinancialDocument({
        mimeType: "image/png",
        base64: "fake-base64",
        timeoutMs: 5,
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({ code: "timeout", retryable: true });
    expect(aborted).toBe(true);
  });

  it("retries a 429 with bounded Retry-After handling", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(new Response(validGeminiBody(), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const delays: Array<number | undefined> = [];

    const result = await extractFinancialDocument({
      mimeType: "image/png",
      base64: "fake-base64",
      backoffMs: (_attempt, retryAfterMs) => {
        delays.push(retryAfterMs);
        return 0;
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([1000]);
    expect(result.documentType).toBe("receipt");
  });

  it("retries transient 500 failures then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response(validGeminiBody(), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractFinancialDocument({
        mimeType: "image/png",
        base64: "fake-base64",
        backoffMs: () => 0,
      }),
    ).resolves.toMatchObject({ documentType: "receipt" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent 400-like provider responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("raw provider salary 45000", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractFinancialDocument({
        mimeType: "image/png",
        base64: "fake-base64",
        backoffMs: () => 0,
      }),
    ).rejects.toMatchObject({ code: "unsupported_document", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry schema failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ documentType: "receipt", transaction: { type: "expense" } }) }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractFinancialDocument({
        mimeType: "image/png",
        base64: "fake-base64",
        backoffMs: () => 0,
      }),
    ).rejects.toMatchObject({ code: "incomplete_financial_extraction", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not log raw provider output on exhausted retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("raw salary 45000 account 1234", { status: 500 })));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      extractFinancialDocument({
        mimeType: "image/png",
        base64: "fake-base64",
        maxAttempts: 2,
        backoffMs: () => 0,
      }),
    ).rejects.toMatchObject({ code: "transient_provider_error" });

    const serialized = JSON.stringify(spy.mock.calls);
    expect(serialized).toContain("transient_provider_error");
    expect(serialized).toContain("attemptCount");
    expect(serialized).not.toContain("45000");
    expect(serialized).not.toContain("account 1234");
  });
});

describe("document processing idempotency", () => {
  beforeEach(() => {
    const state = getMockState();
    state.documents = [];
    state.documentExtractions = [];
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.users.clear();
  });

  it("claiming a processing document prevents duplicate processors", async () => {
    const doc = await createDocument("user-a", {
      status: "uploaded",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/file.png",
      originalFilename: "receipt.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });

    const first = await claimDocumentForProcessing("user-a", doc.id);
    const second = await claimDocumentForProcessing("user-a", doc.id);

    expect(first?.status).toBe("processing");
    expect(second).toBeNull();
  });

  it("does not reclaim a fresh processing lease", async () => {
    const now = new Date("2026-07-11T10:00:00.000Z");
    const doc = await createDocument("user-a", {
      status: "uploaded",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/file.png",
      originalFilename: "receipt.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });

    const first = await claimDocumentForProcessing("user-a", doc.id, { now });
    const second = await claimDocumentForProcessing("user-a", doc.id, {
      now: new Date(now.getTime() + DOCUMENT_PROCESSING_LEASE_MS - 1000),
    });

    expect(first?.status).toBe("processing");
    expect(second).toBeNull();
  });

  it("reclaims a stale processing lease after a crash", async () => {
    const firstNow = new Date("2026-07-11T10:00:00.000Z");
    const recoveryNow = new Date(firstNow.getTime() + DOCUMENT_PROCESSING_LEASE_MS + 1000);
    const doc = await createDocument("user-a", {
      status: "uploaded",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/file.png",
      originalFilename: "receipt.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });

    const first = await claimDocumentForProcessing("user-a", doc.id, { now: firstNow });
    const recovered = await claimDocumentForProcessing("user-a", doc.id, { now: recoveryNow });

    expect(first?.processingStartedAt).toBe(firstNow.toISOString());
    expect(recovered?.status).toBe("processing");
    expect(recovered?.processingStartedAt).toBe(recoveryNow.toISOString());
  });

  it("rejects a late result from an expired processing lease", async () => {
    const firstNow = new Date("2026-07-11T10:00:00.000Z");
    const lateNow = new Date(firstNow.getTime() + DOCUMENT_PROCESSING_LEASE_MS + 1000);
    const doc = await createDocument("user-a", {
      status: "uploaded",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/file.png",
      originalFilename: "receipt.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });
    const claim = await claimDocumentForProcessing("user-a", doc.id, { now: firstNow });

    const completed = await completeDocumentProcessing("user-a", doc.id, claim!.processingStartedAt!, {
      documentType: "receipt",
      now: lateNow,
    });

    expect(completed).toBeNull();
    expect(getMockState().documents[0]).toMatchObject({
      id: doc.id,
      status: "processing",
      processingStartedAt: firstNow.toISOString(),
    });
    expect(getMockState().documentExtractions).toHaveLength(0);
  });

  it("rejects a late result after another processor recovers the stale claim", async () => {
    const firstNow = new Date("2026-07-11T10:00:00.000Z");
    const recoveryNow = new Date(firstNow.getTime() + DOCUMENT_PROCESSING_LEASE_MS + 1000);
    const doc = await createDocument("user-a", {
      status: "uploaded",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/file.png",
      originalFilename: "receipt.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });
    const first = await claimDocumentForProcessing("user-a", doc.id, { now: firstNow });
    const recovered = await claimDocumentForProcessing("user-a", doc.id, { now: recoveryNow });

    const lateCompleted = await completeDocumentProcessing("user-a", doc.id, first!.processingStartedAt!, {
      documentType: "receipt",
      now: recoveryNow,
    });
    const recoveredCompleted = await completeDocumentProcessing("user-a", doc.id, recovered!.processingStartedAt!, {
      documentType: "receipt",
      now: recoveryNow,
    });

    expect(lateCompleted).toBeNull();
    expect(recoveredCompleted?.status).toBe("review_ready");
  });

  it("allows retry after failed_retryable but not failed_permanent", async () => {
    const retryable = await createDocument("user-a", {
      status: "failed_retryable",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/retry.png",
      originalFilename: "retry.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });
    const permanent = await createDocument("user-a", {
      status: "failed_permanent",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/permanent.png",
      originalFilename: "permanent.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });

    await expect(claimDocumentForProcessing("user-a", retryable.id)).resolves.toMatchObject({ status: "processing" });
    await expect(claimDocumentForProcessing("user-a", permanent.id)).resolves.toBeNull();
  });

  it("keeps legacy uploaded and failed statuses processable", async () => {
    const uploaded = await createDocument("user-a", {
      status: "uploaded",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/uploaded.png",
      originalFilename: "uploaded.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });
    const failed = await createDocument("user-a", {
      status: "failed",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/failed.png",
      originalFilename: "failed.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });

    await expect(claimDocumentForProcessing("user-a", uploaded.id)).resolves.toMatchObject({ status: "processing" });
    await expect(claimDocumentForProcessing("user-a", failed.id)).resolves.toMatchObject({ status: "processing" });
  });

  it("successful retry reuses the document and storage object and moves to review_ready", async () => {
    const doc = await createDocument("user-a", {
      status: "uploaded",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/retry_success_receipt.png",
      originalFilename: "retry_success_receipt.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });

    await expect(processAndExtractDocument("user-a", doc.id)).rejects.toMatchObject({ code: "transient_provider_error" });
    let stored = getMockState().documents.find((item) => item.id === doc.id);
    expect(stored).toMatchObject({
      id: doc.id,
      storagePath: doc.storagePath,
      status: "failed_retryable",
    });

    await expect(processAndExtractDocument("user-a", doc.id)).resolves.toMatchObject({ documentType: "receipt" });
    stored = getMockState().documents.find((item) => item.id === doc.id);

    expect(getMockState().documents).toHaveLength(1);
    expect(getMockState().documentExtractions).toHaveLength(1);
    expect(stored).toMatchObject({
      id: doc.id,
      storagePath: doc.storagePath,
      status: "review_ready",
      processingStartedAt: undefined,
    });
  });

  it("new extraction writes replace existing extraction records for the same document", async () => {
    const doc = await createDocument("user-a", {
      status: "uploaded",
      storageBucket: "financial-documents",
      storagePath: "user-a/doc/file.png",
      originalFilename: "receipt.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
    });

    await createDocumentExtraction("user-a", {
      documentId: doc.id,
      model: "old",
      rawOutput: { old: true },
      normalizedPreview: { old: true },
      warnings: [],
      unclearFields: [],
    });
    await createDocumentExtraction("user-a", {
      documentId: doc.id,
      model: "new",
      rawOutput: { new: true },
      normalizedPreview: { new: true },
      warnings: [],
      unclearFields: [],
    });

    expect(getMockState().documentExtractions).toHaveLength(1);
    expect(getMockState().documentExtractions[0]?.model).toBe("new");
  });
});
