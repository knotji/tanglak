import { beforeEach, describe, expect, it, vi } from "vitest";
import { processAndExtractDocument } from "@/lib/ai/extract-document";
import { createDocument, getDocumentExtraction, listTransactions } from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
  };
});

function seedDocument(userId: string, storagePath: string) {
  return createDocument(userId, {
    status: "uploaded",
    storageBucket: "financial-documents",
    storagePath,
    originalFilename: storagePath.split("/").pop(),
    mimeType: "image/png",
    fileSizeBytes: 10,
  });
}

describe("missing occurredAt routes to needs_review, not extraction failure", () => {
  beforeEach(() => {
    const state = getMockState();
    state.documents = [];
    state.documentExtractions = [];
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.users.clear();
  });

  it("does not throw incomplete_financial_extraction when only occurredAt is missing", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    await expect(processAndExtractDocument("user-a", doc.id)).resolves.toMatchObject({
      documentType: "receipt",
    });
  });

  it("sets the document status to needs_review (never failed_permanent/failed_retryable)", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    await processAndExtractDocument("user-a", doc.id);

    const stored = getMockState().documents.find((d) => d.id === doc.id);
    expect(stored?.status).toBe("needs_review");
  });

  it("persists the extraction (it is not discarded)", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    await processAndExtractDocument("user-a", doc.id);

    const extraction = await getDocumentExtraction("user-a", doc.id);
    expect(extraction).not.toBeNull();
    expect(extraction?.unclearFields).toContain("transaction.occurredAt");
  });

  it("preserves amount, type, merchant, and category from the draft extraction", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    const result = await processAndExtractDocument("user-a", doc.id);

    expect(result.transaction?.amount).toBe(250);
    expect(result.transaction?.type).toBe("expense");
    expect(result.transaction?.merchant).toBe("ร้านค้าทดสอบไม่มีวันที่");
    expect(result.transaction?.category).toBe("อาหาร");
    expect(result.transaction?.occurredAt).toBeUndefined();
  });

  it("never fabricates a current-time/upload-time fallback for the missing occurredAt", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    const result = await processAndExtractDocument("user-a", doc.id);

    // The extraction result itself must never carry a guessed value -- the
    // field stays genuinely absent, not silently populated with "now".
    expect(result.transaction).not.toHaveProperty("occurredAt");
  });

  it("still fails extraction for broader-than-occurredAt problems (does not convert every failure into needs_review)", async () => {
    // The "unclear" mock filename produces a low-confidence extraction that
    // is still schema-valid (amount/type absent is fine for a generic
    // receipt only when totalPaid/amount are both missing -- this fixture
    // simply proves a real failure path, transient_provider_error, still
    // fails as before).
    const doc = await seedDocument("user-a", "user-a/doc/failed_receipt.png");
    await expect(processAndExtractDocument("user-a", doc.id)).rejects.toMatchObject({
      code: "transient_provider_error",
    });
    const stored = getMockState().documents.find((d) => d.id === doc.id);
    expect(stored?.status).toBe("failed_retryable");
  });

  it("a valid occurredAt still follows the existing normal flow (no regression)", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/generic_receipt.png");
    const result = await processAndExtractDocument("user-a", doc.id);

    expect(result.transaction?.occurredAt).toBe("2026-07-10T12:00:00+07:00");
    expect(result.unclearFields).not.toContain("transaction.occurredAt");

    const stored = getMockState().documents.find((d) => d.id === doc.id);
    expect(stored?.status).toBe("review_ready");
  });
});

describe("retry from needs_review reuses the same document and storage object", () => {
  beforeEach(() => {
    const state = getMockState();
    state.documents = [];
    state.documentExtractions = [];
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.users.clear();
  });

  it("is reprocessable from needs_review (retry remains available)", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    await processAndExtractDocument("user-a", doc.id);
    expect(getMockState().documents.find((d) => d.id === doc.id)?.status).toBe("needs_review");

    // Reprocessing must succeed (i.e. claimDocumentForProcessing accepts
    // needs_review as a processable status) rather than being blocked.
    await expect(processAndExtractDocument("user-a", doc.id)).resolves.toMatchObject({
      documentType: "receipt",
    });
  });

  it("retry reuses the same document row -- no duplicate document is created", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    await processAndExtractDocument("user-a", doc.id);
    await processAndExtractDocument("user-a", doc.id);

    const matching = getMockState().documents.filter((d) => d.id === doc.id);
    expect(matching).toHaveLength(1);
    expect(getMockState().documents).toHaveLength(1);
    expect(matching[0].storagePath).toBe(doc.storagePath);
  });

  it("retry replaces (not duplicates) the extraction record for the same document", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    await processAndExtractDocument("user-a", doc.id);
    await processAndExtractDocument("user-a", doc.id);

    const extractions = getMockState().documentExtractions.filter((e) => e.documentId === doc.id);
    expect(extractions).toHaveLength(1);
  });

  it("retry never creates a duplicate storage upload (no new document row means no new storagePath either)", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    await processAndExtractDocument("user-a", doc.id);
    const beforeRetryPath = getMockState().documents.find((d) => d.id === doc.id)?.storagePath;

    await processAndExtractDocument("user-a", doc.id);
    const afterRetryPath = getMockState().documents.find((d) => d.id === doc.id)?.storagePath;

    expect(afterRetryPath).toBe(beforeRetryPath);
  });
});

describe("safety: unrelated invariants are unaffected by this fix", () => {
  beforeEach(() => {
    const state = getMockState();
    state.documents = [];
    state.documentExtractions = [];
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.users.clear();
  });

  it("a needs_review extraction never auto-creates a transaction on its own", async () => {
    const doc = await seedDocument("user-a", "user-a/doc/missing_date_receipt.png");
    await processAndExtractDocument("user-a", doc.id);

    const transactions = await listTransactions("user-a", "2026-07");
    expect(transactions).toHaveLength(0);
  });
});
