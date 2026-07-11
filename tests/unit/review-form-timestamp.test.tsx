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

  it('shows a neutral Thai helper "11 ก.ค. 2026 เวลา 07:26" for an extracted timestamp, linked via aria-describedby', async () => {
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

    const input = container.querySelector<HTMLInputElement>('input[name="occurredAt"]')!;
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const helper = container.querySelector(`#${describedById}`);
    expect(helper).not.toBeNull();
    expect(helper!.textContent).toContain("11 ก.ค. 2026 เวลา 07:26");
    expect(helper!.textContent).toContain("อ่านจากเอกสาร");
    // Canonical value driving form submission must remain the plain
    // datetime-local wall-clock string, unaffected by the Thai helper text.
    expect(input.value).toBe("2026-07-11T07:26");
  });

  it("updates the Thai helper live as the user edits the datetime-local input, with no timezone shift", async () => {
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

    const input = container.querySelector<HTMLInputElement>('input[name="occurredAt"]')!;
    const describedById = input.getAttribute("aria-describedby")!;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    await act(async () => {
      nativeSetter.call(input, "2026-12-31T23:55");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const helper = container.querySelector(`#${describedById}`);
    // Reflects the newly typed value exactly, not the original 07:26 value
    // and not a UTC-shifted reinterpretation of the new local digits.
    expect(helper!.textContent).toContain("31 ธ.ค. 2026 เวลา 23:55");
  });

  it("shows an uncertain-state warning helper for an inferred (date-only source) timestamp", async () => {
    const extraction = buildExtraction({
      documentType: "receipt",
      confidence: 0.7,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        occurredAt: "2026-07-11T12:00:00+07:00",
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

    const input = container.querySelector<HTMLInputElement>('input[name="occurredAt"]')!;
    const describedById = input.getAttribute("aria-describedby")!;
    const helper = container.querySelector(`#${describedById}`);
    expect(helper!.textContent).toContain("11 ก.ค. 2026 เวลา 12:00");
    expect(helper!.textContent).toContain("ควรตรวจสอบวันที่และเวลา");
    // Never expose the internal parser state name.
    expect(helper!.textContent).not.toContain("inferred");
  });

  it("shows a clear fill-in prompt when the datetime-local input is cleared to empty", async () => {
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

    const input = container.querySelector<HTMLInputElement>('input[name="occurredAt"]')!;
    const describedById = input.getAttribute("aria-describedby")!;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    await act(async () => {
      nativeSetter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const helper = container.querySelector(`#${describedById}`);
    expect(helper!.textContent).toContain("กรุณาระบุวันและเวลา");
  });

  it("falls back to the empty-value fill-in prompt when the native input rejects an out-of-range calendar date", async () => {
    // A native (and jsdom-simulated) datetime-local input self-sanitizes an
    // invalid calendar date like Feb 30 to an empty string rather than
    // passing it through — so in practice this path collapses into the
    // "missing" prompt. The "invalid" display state itself is still
    // exercised directly at the formatter level (see date-thai-format.test.ts),
    // defensively covering any value that reaches the component already
    // malformed (e.g. restored from an unexpected source).
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

    const input = container.querySelector<HTMLInputElement>('input[name="occurredAt"]')!;
    const describedById = input.getAttribute("aria-describedby")!;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    await act(async () => {
      nativeSetter.call(input, "2026-02-30T07:26");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(input.value).toBe("");
    const helper = container.querySelector(`#${describedById}`);
    expect(helper!.textContent).toContain("กรุณาระบุวันและเวลา");
  });

  it("shows an uncertain-state helper (not a false extracted confirmation) when no document timestamp was extracted at all", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T08:00:00Z"));

    const extraction = buildExtraction({
      documentType: "receipt",
      confidence: 0.5,
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        merchant: "Seven-Eleven",
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

    const input = container.querySelector<HTMLInputElement>('input[name="occurredAt"]')!;
    const describedById = input.getAttribute("aria-describedby")!;
    const helper = container.querySelector(`#${describedById}`);
    expect(helper!.textContent).toContain("ควรตรวจสอบวันที่และเวลา");
    expect(helper!.textContent).not.toContain("อ่านจากเอกสาร");

    vi.useRealTimers();
  });
});
