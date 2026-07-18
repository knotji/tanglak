import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDocument, createTransaction, listPendingReviewDocuments } from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const USER_ID = "pending-review-user";
const OTHER_USER_ID = "pending-review-other-user";

describe("listPendingReviewDocuments", () => {
  beforeEach(() => {
    const state = getMockState();
    state.documents = [];
    state.transactions = [];
  });

  it("returns documents still awaiting review, oldest first, excluding confirmed/failed ones", async () => {
    // Reproduces the reported bug: uploading 2 slips, reviewing/confirming
    // only the first, leaves the second's document row sitting here --
    // still discoverable, even though the in-memory batch results list on
    // /upload that originally showed it is long gone.
    await createDocument(USER_ID, {
      status: "confirmed",
      originalFilename: "already-confirmed.jpg",
      storageBucket: "financial-documents",
      storagePath: "a.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100,
    });
    const secondSlip = await createDocument(USER_ID, {
      status: "needs_review",
      originalFilename: "second-slip.jpg",
      storageBucket: "financial-documents",
      storagePath: "b.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100,
    });
    const thirdSlip = await createDocument(USER_ID, {
      status: "review_ready",
      originalFilename: "third-slip.jpg",
      storageBucket: "financial-documents",
      storagePath: "c.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100,
    });
    // Force a deterministic creation order -- createDocument always stamps
    // createdAt with the real current time, which can tie across rapid
    // successive calls in a test.
    getMockState().documents.find((d) => d.id === secondSlip.id)!.createdAt = "2026-07-01T00:00:01.000Z";
    getMockState().documents.find((d) => d.id === thirdSlip.id)!.createdAt = "2026-07-01T00:00:02.000Z";
    await createDocument(USER_ID, {
      status: "failed_permanent",
      originalFilename: "failed.jpg",
      storageBucket: "financial-documents",
      storagePath: "d.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100,
    });
    await createDocument(OTHER_USER_ID, {
      status: "needs_review",
      originalFilename: "someone-elses-slip.jpg",
      storageBucket: "financial-documents",
      storagePath: "e.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100,
    });

    const pending = await listPendingReviewDocuments(USER_ID);

    expect(pending.map((d) => d.originalFilename)).toEqual(["second-slip.jpg", "third-slip.jpg"]);
    expect(pending.map((d) => d.id)).toEqual([secondSlip.id, thirdSlip.id]);
  });

  it("excludes a document the AI Financial Autopilot already auto-saved, even though its status is still review_ready", async () => {
    // The autopilot auto-execute path (runSlipImportAutopilot ->
    // autopilot-executor.ts) creates the transaction directly, linked via
    // documentId, without ever marking the source document "confirmed" --
    // so status alone can't distinguish "still needs a human" from
    // "already auto-saved". Without this exclusion, an already-saved slip
    // would show up as pending, and clicking into it would land on the
    // manual review form for a transaction that already exists.
    const autoSavedDoc = await createDocument(USER_ID, {
      status: "review_ready",
      originalFilename: "auto-saved.jpg",
      storageBucket: "financial-documents",
      storagePath: "g.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100,
    });
    await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 18_500,
      occurredAt: "2026-07-10T12:30:00+07:00",
      merchant: "GrabFood",
      documentId: autoSavedDoc.id,
    });
    const stillPendingDoc = await createDocument(USER_ID, {
      status: "review_ready",
      originalFilename: "still-pending.jpg",
      storageBucket: "financial-documents",
      storagePath: "h.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100,
    });

    const pending = await listPendingReviewDocuments(USER_ID);

    expect(pending.map((d) => d.id)).toEqual([stillPendingDoc.id]);
  });

  it("returns an empty list when nothing is pending", async () => {
    await createDocument(USER_ID, {
      status: "confirmed",
      originalFilename: "done.jpg",
      storageBucket: "financial-documents",
      storagePath: "f.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100,
    });

    expect(await listPendingReviewDocuments(USER_ID)).toEqual([]);
  });
});
