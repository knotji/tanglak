import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDocumentAction, deleteDocumentAction } from "@/app/actions/documents";
import { createDocument, getDocument } from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const USER_ID = "mock-user-delete-pending-doc";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
    requireUser: async () => ({ id: USER_ID, email: "mock-user-delete-pending-doc@example.test" }),
  };
});

const repositoryMocks = vi.hoisted(() => ({
  getTransactionByDocumentId: vi.fn(),
  originalGetTransactionByDocumentId: undefined as unknown as typeof import("@/lib/data/finance-repository").getTransactionByDocumentId,
}));

vi.mock("@/lib/data/finance-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data/finance-repository")>();
  repositoryMocks.originalGetTransactionByDocumentId = original.getTransactionByDocumentId;
  repositoryMocks.getTransactionByDocumentId.mockImplementation(original.getTransactionByDocumentId);
  return {
    ...original,
    getTransactionByDocumentId: repositoryMocks.getTransactionByDocumentId,
  };
});

function resetState() {
  const state = getMockState();
  state.documents = [];
  state.documentExtractions = [];
  state.transactions = [];
  state.debts = [];
  state.accounts = [];
  state.autopilotActions = [];
  state.users.clear();
}

async function seedDocument(status: "needs_review" | "review_ready" | "confirmed" = "needs_review") {
  return createDocument(USER_ID, {
    status,
    documentType: "receipt",
    storageBucket: "financial-documents",
    storagePath: `${USER_ID}/receipt.png`,
    originalFilename: "forcereview_a.jpg",
    mimeType: "image/png",
    fileSizeBytes: 10,
  });
}

function receiptFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("documentType", "receipt");
  fd.set("merchant", "Special Café");
  fd.set("occurredAt", "2026-07-15T09:30");
  fd.set("totalPaid", "250");
  fd.set("paymentMethod", "card");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  resetState();
  repositoryMocks.getTransactionByDocumentId.mockReset();
  repositoryMocks.getTransactionByDocumentId.mockImplementation(repositoryMocks.originalGetTransactionByDocumentId);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteDocumentAction guards against removing evidence for a confirmed transaction", () => {
  it("deletes a pending (needs_review) document with no linked transaction", async () => {
    const doc = await seedDocument("needs_review");

    const result = await deleteDocumentAction(doc.id);

    expect(result.ok).toBe(true);
    expect(await getDocument(USER_ID, doc.id)).toBeNull();
  });

  it("refuses to delete a document whose status is already confirmed", async () => {
    const doc = await seedDocument("confirmed");

    const result = await deleteDocumentAction(doc.id);

    expect(result.ok).toBe(false);
    expect(await getDocument(USER_ID, doc.id)).not.toBeNull();
  });

  it("reproduces the reported race (slip confirmed in another tab): refuses to delete once a confirmed transaction links to the document, even if a stale in-memory status still reads needs_review", async () => {
    const doc = await seedDocument("needs_review");
    const confirmResult = await confirmDocumentAction(doc.id, receiptFormData());
    expect(confirmResult.ok).toBe(true);

    // The upload page's pending list was fetched before the other tab's
    // confirmation landed -- force the in-memory row's status back to what
    // the stale list would have shown, so this test exercises the
    // linked-transaction guard specifically, not just the status guard.
    const stored = getMockState().documents.find((d) => d.id === doc.id);
    expect(stored).toBeTruthy();
    if (stored) stored.status = "needs_review";

    const result = await deleteDocumentAction(doc.id);

    expect(result.ok).toBe(false);
    expect(await getDocument(USER_ID, doc.id)).not.toBeNull();
  });

  it("does not delete when a confirmation flips the document's status in the exact window between the pre-check read and the delete statement (Codex atomicity finding)", async () => {
    const doc = await seedDocument("needs_review");

    // Simulate a concurrent confirmDocumentAction call that finishes and
    // flips this document's status to "confirmed" right in between our
    // pre-check reads and the actual delete call -- deleteDocumentAction's
    // own linked-transaction pre-check still sees "no linked transaction"
    // here (this mock stands in for that timing), so only an atomic,
    // status-conditioned delete statement can still catch it.
    repositoryMocks.getTransactionByDocumentId.mockImplementationOnce(async (userId: string, documentId: string) => {
      const stored = getMockState().documents.find((d) => d.id === documentId && d.userId === userId);
      if (stored) stored.status = "confirmed";
      return null;
    });

    const result = await deleteDocumentAction(doc.id);

    expect(result.ok).toBe(false);
    const survivor = await getDocument(USER_ID, doc.id);
    expect(survivor).not.toBeNull();
    expect(survivor?.status).toBe("confirmed");
  });
});
