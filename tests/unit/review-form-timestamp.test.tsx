import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ReviewForm } from "@/app/upload/review/[documentId]/ReviewForm";
import type { FinanceDocument, DocumentExtraction } from "@/types/domain";
import type { ExtractedFinancialDocument } from "@/lib/ai/schemas";

// @ts-expect-error -- test intentionally overrides browser timer behavior
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter() {
    return { push: () => {}, refresh: () => {} };
  },
  usePathname() {
    return "/upload/review/doc-1";
  },
}));

function buildDocument(overrides: Partial<FinanceDocument> = {}): FinanceDocument {
  return {
    id: "doc-1",
    userId: "user-1",
    status: "needs_review",
    documentType: "receipt",
    storageBucket: "financial-documents",
    storagePath: "user-1/doc-1.png",
    mimeType: "image/png",
    fileSizeBytes: 1024,
    createdAt: "2026-07-11T07:26:00+07:00",
    updatedAt: "2026-07-11T07:26:00+07:00",
    ...overrides,
  };
}

function buildExtraction(preview: Partial<ExtractedFinancialDocument>): DocumentExtraction {
  return {
    id: "extraction-1",
    userId: "user-1",
    documentId: "doc-1",
    model: "gemini-test",
    rawOutput: preview,
    normalizedPreview: preview,
    confidence: 0.9,
    warnings: [],
    unclearFields: [],
    requiresReview: true,
    createdAt: "2026-07-11T07:26:00+07:00",
    updatedAt: "2026-07-11T07:26:00+07:00",
  };
}

describe("ReviewForm receipt timestamp display", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("displays a normalized 2026-07-11T07:26 receipt timestamp in the datetime-local input", async () => {
    const extraction = buildExtraction({
      documentType: "receipt",
      confidence: 0.9,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        occurredAt: "2026-07-11T07:26:00+07:00",
        merchant: "Seven-Eleven",
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ReviewForm
          document={buildDocument()}
          extraction={extraction}
          debts={[]}
          duplicateTransactions={[]}
          previewUrl="https://example.test/preview.png"
        />,
      );
    });

    const dateTimeInputs = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
    expect(dateTimeInputs.length).toBeGreaterThan(0);
    // Every occurredAt datetime-local input on the receipt form must reflect
    // the extracted value exactly — not a UTC-labeled-as-local fallback.
    dateTimeInputs.forEach((input) => {
      expect(input.value).toBe("2026-07-11T07:26");
    });
  });

  it("does not fall back to the current UTC wall-clock time when occurredAt is genuinely absent", async () => {
    vi.useFakeTimers();
    // Bangkok is UTC+7: at this instant Bangkok is 2026-07-11 15:00, while
    // naive `new Date().toISOString()` would read 2026-07-11T08:00 UTC. The
    // old bug displayed the UTC value as if it were already Bangkok time.
    vi.setSystemTime(new Date("2026-07-11T08:00:00Z"));

    const extraction = buildExtraction({
      documentType: "receipt",
      confidence: 0.5,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        merchant: "Seven-Eleven",
        // occurredAt intentionally omitted
      },
      warnings: [],
      unclearFields: ["transaction.occurredAt"],
      requiresReview: true,
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ReviewForm
          document={buildDocument()}
          extraction={extraction}
          debts={[]}
          duplicateTransactions={[]}
          previewUrl="https://example.test/preview.png"
        />,
      );
    });

    const dateTimeInputs = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
    expect(dateTimeInputs.length).toBeGreaterThan(0);
    dateTimeInputs.forEach((input) => {
      // Must reflect Bangkok wall-clock "now" (15:00), never the raw UTC
      // instant (08:00) mislabeled as local time.
      expect(input.value).toBe("2026-07-11T15:00");
    });

    vi.useRealTimers();
  });
});
