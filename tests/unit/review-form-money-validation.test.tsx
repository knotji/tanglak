import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReviewForm } from "@/app/upload/review/[documentId]/ReviewForm";
import type { DocumentExtraction, FinanceDocument } from "@/types/domain";
import type { ExtractedFinancialDocument } from "@/lib/ai/schemas";

// @ts-expect-error -- test intentionally opts in to React act checks.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const confirmDocumentAction = vi.fn(async (_documentId: string, _formData: FormData) => ({ ok: true }));
const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter() {
    return { push: routerPush, refresh: () => {} };
  },
  usePathname() {
    return "/upload/review/doc-money";
  },
}));

vi.mock("@/app/actions/documents", () => ({
  confirmDocumentAction: (documentId: string, formData: FormData) => confirmDocumentAction(documentId, formData),
  deleteDocumentAction: vi.fn(),
  retryExtractionAction: vi.fn(),
  resolveDuplicateAction: vi.fn(),
}));

function buildDocument(): FinanceDocument {
  return {
    id: "doc-money",
    userId: "user-1",
    status: "needs_review",
    documentType: "delivery_receipt",
    storageBucket: "financial-documents",
    storagePath: "user-1/doc-money.png",
    mimeType: "image/png",
    fileSizeBytes: 1024,
    createdAt: "2026-07-11T07:26:00+07:00",
    updatedAt: "2026-07-11T07:26:00+07:00",
  };
}

function buildExtraction(): DocumentExtraction {
  const normalizedPreview: ExtractedFinancialDocument = {
    documentType: "delivery_receipt",
    confidence: 0.9,
    transaction: {
      type: "expense",
      amount: 185,
      currency: "THB",
      occurredAt: "2026-07-11T07:26:00+07:00",
      merchant: "GrabFood",
    },
    receipt: { totalPaid: 185 },
    warnings: [],
    unclearFields: [],
    requiresReview: true,
  };

  return {
    id: "extraction-money",
    userId: "user-1",
    documentId: "doc-money",
    model: "gemini-test",
    rawOutput: normalizedPreview,
    normalizedPreview,
    confidence: 0.9,
    warnings: [],
    unclearFields: [],
    requiresReview: true,
    createdAt: "2026-07-11T07:26:00+07:00",
    updatedAt: "2026-07-11T07:26:00+07:00",
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.requestSubmit();
  });
}

describe("ReviewForm receipt money validation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    confirmDocumentAction.mockClear();
    routerPush.mockClear();
    root = createRoot(container);
    await act(async () => {
      root.render(
        <ReviewForm
          document={buildDocument()}
          extraction={buildExtraction()}
          debts={[]}
          duplicateTransactions={[]}
          previewUrl="https://example.test/preview.png"
        />,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("keeps the receipt total field error visible after submit, blocks the server action, and clears after correction", async () => {
    const totalPaidInput = container.querySelector<HTMLInputElement>('input[name="totalPaid"]')!;
    const form = container.querySelector<HTMLFormElement>("form")!;

    await act(async () => {
      setInputValue(totalPaidInput, "-195");
    });

    expect(totalPaidInput.value).toBe("-195");
    expect(totalPaidInput.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("จำนวนเงินต้องไม่ติดลบ");

    await submit(form);

    expect(container.textContent).toContain("จำนวนเงินต้องไม่ติดลบ");
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(totalPaidInput.value).toBe("-195");
    expect(totalPaidInput.getAttribute("aria-invalid")).toBe("true");
    expect(confirmDocumentAction).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();

    await act(async () => {
      setInputValue(totalPaidInput, "195");
    });

    expect(totalPaidInput.value).toBe("195");
    expect(totalPaidInput.getAttribute("aria-invalid")).not.toBe("true");
    expect(container.textContent).not.toContain("จำนวนเงินต้องไม่ติดลบ");

    await submit(form);

    expect(confirmDocumentAction).toHaveBeenCalledTimes(1);
    const [, formData] = confirmDocumentAction.mock.calls[0] as unknown as [string, FormData];
    expect(formData.get("totalPaid")).toBe("195");
  });
});
