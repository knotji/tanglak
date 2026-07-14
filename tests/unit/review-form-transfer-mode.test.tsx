import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ReviewForm } from "@/app/upload/review/[documentId]/ReviewForm";
import type { Debt, DocumentExtraction, FinanceDocument } from "@/types/domain";
import type { ExtractedFinancialDocument } from "@/lib/ai/schemas";

// @ts-expect-error -- test intentionally opts in to React act checks.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const confirmDocumentAction = vi.fn(
  async (_documentId: string, _formData: FormData) => ({ ok: true }),
);

vi.mock("next/navigation", () => ({
  useRouter() {
    return { push: () => {}, refresh: () => {} };
  },
  usePathname() {
    return "/upload/review/doc-transfer";
  },
}));

vi.mock("@/app/actions/documents", () => ({
  confirmDocumentAction: (documentId: string, formData: FormData) =>
    confirmDocumentAction(documentId, formData),
  deleteDocumentAction: vi.fn(),
  retryExtractionAction: vi.fn(),
  resolveDuplicateAction: vi.fn(),
}));

function buildDocument(): FinanceDocument {
  return {
    id: "doc-transfer",
    userId: "user-1",
    status: "needs_review",
    documentType: "transfer_slip",
    storageBucket: "financial-documents",
    storagePath: "user-1/doc-transfer.png",
    mimeType: "image/png",
    fileSizeBytes: 1024,
    createdAt: "2026-07-11T07:26:00+07:00",
    updatedAt: "2026-07-11T07:26:00+07:00",
  };
}

function buildExtraction(
  preview: Partial<ExtractedFinancialDocument> = {},
): DocumentExtraction {
  const normalizedPreview: Partial<ExtractedFinancialDocument> = {
    documentType: "transfer_slip",
    confidence: 0.9,
    transaction: {
      type: "expense",
      amount: 250,
      currency: "THB",
      occurredAt: "2026-07-11T07:26:00+07:00",
      merchant: "Cafe",
    },
    warnings: [],
    unclearFields: [],
    requiresReview: true,
    ...preview,
  };

  return {
    id: "extraction-1",
    userId: "user-1",
    documentId: "doc-transfer",
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

const debts: Debt[] = [
  {
    id: "debt-1",
    userId: "user-1",
    name: "Credit Card",
    creditor: "Bank",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    outstandingBalanceSatang: 100_000,
    minimumPaymentSatang: 5_000,
    amountPaidThisCycleSatang: 0,
    dueDate: "2026-07-31",
    status: "active",
  },
];

async function renderForm(
  container: HTMLDivElement,
  extraction = buildExtraction(),
) {
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ReviewForm
        document={buildDocument()}
        extraction={extraction}
        debts={debts}
        duplicateTransactions={[]}
        previewUrl="https://example.test/preview.png"
      />,
    );
  });
  return root;
}

describe("ReviewForm transfer-slip mode selector", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    confirmDocumentAction.mockClear();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("shows the mode selector before detailed fields with a clear selected state", async () => {
    await renderForm(container);

    const modeHeading =
      container.textContent?.indexOf("รายการนี้เป็นแบบไหน?") ?? -1;
    const amountField = container.textContent?.indexOf("ยอดโอน (บาท)") ?? -1;
    expect(modeHeading).toBeGreaterThanOrEqual(0);
    expect(amountField).toBeGreaterThan(modeHeading);
    expect(container.textContent).not.toContain(
      "การจัดกลุ่มประเภทการทำรายการโอน",
    );

    expect(container.textContent).toContain(
      "ซื้อสินค้าหรือบริการ และนับเป็นรายจ่าย",
    );
    expect(container.textContent).toContain(
      "เงินย้ายระหว่างบัญชีของคุณ ไม่นับเป็นรายจ่าย",
    );
    expect(container.textContent).toContain(
      "บันทึกเป็นการชำระหนี้และผูกกับบัญชีหนี้",
    );
    expect(container.textContent).toContain("เลือกแล้ว");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="type"][value="expense"]',
      )?.checked,
    ).toBe(true);
    expect(container.textContent).toContain("บันทึกเป็นรายจ่าย");
  });

  it("updates CTA by mode and submits the selected mode and debt id", async () => {
    await renderForm(container);

    const transferRadio = container.querySelector<HTMLInputElement>(
      'input[name="type"][value="transfer"]',
    )!;
    await act(async () => {
      transferRadio.click();
    });
    expect(container.textContent).toContain("บันทึกเป็นเงินโอน");

    const debtRadio = container.querySelector<HTMLInputElement>(
      'input[name="type"][value="debt_payment"]',
    )!;
    await act(async () => {
      debtRadio.click();
    });
    expect(container.textContent).toContain("บันทึกเป็นการชำระหนี้");

    const debtSelect = container.querySelector<HTMLSelectElement>(
      'select[name="debtId"]',
    )!;
    await act(async () => {
      debtSelect.value = "debt-1";
      debtSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.requestSubmit();
    });

    expect(confirmDocumentAction).toHaveBeenCalledTimes(1);
    const [, formData] = confirmDocumentAction.mock.calls[0] as unknown as [
      string,
      FormData,
    ];
    expect(formData.get("type")).toBe("debt_payment");
    expect(formData.get("debtId")).toBe("debt-1");
  });
});
