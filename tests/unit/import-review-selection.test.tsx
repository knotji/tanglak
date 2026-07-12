import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ReviewBoardClient } from "@/app/history-import/[batchId]/review/ReviewBoardClient";
import type { ImportBatch, ImportRow, Debt } from "@/types/domain";
import { confirmBatchAction } from "@/app/actions/history-import";

// Set Act environment
// @ts-expect-error -- test intentionally overrides browser act behavior
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter() {
    return { push: () => {}, refresh: () => {} };
  },
  usePathname() {
    return "/history-import/batch-1/review";
  },
}));

// Mock server actions
vi.mock("@/app/actions/history-import", () => ({
  confirmBatchAction: vi.fn(() => Promise.resolve({ ok: true })),
  deleteBatchAction: vi.fn(() => Promise.resolve({ ok: true })),
}));

function buildBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: "batch-1",
    userId: "user-1",
    accountId: "account-1",
    status: "processing",
    sourceType: "pdf",
    pageCount: 1,
    originalFilename: "statement.pdf",
    createdAt: "2026-07-11T09:00:00Z",
    updatedAt: "2026-07-11T09:00:00Z",
    ...overrides,
  };
}

function buildRow(id: string, overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    id,
    userId: "user-1",
    importBatchId: "batch-1",
    sourceRowIndex: 0,
    occurredAt: "2026-07-11T09:30:00Z",
    description: `Merchant ${id}`,
    amountSatang: 15000,
    direction: "debit",
    currency: "THB",
    duplicateScore: 0,
    reviewStatus: "ready",
    importDecision: "unresolved",
    validationWarnings: [],
    parserSource: "deterministic",
    createdAt: "2026-07-11T09:00:00Z",
    updatedAt: "2026-07-11T09:00:00Z",
    ...overrides,
  };
}

describe("History Import Review Selection Model", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
    window.confirm = () => true;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("selects all valid rows by default and excludes duplicates and invalid rows", async () => {
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready" }),
      buildRow("row-2", { reviewStatus: "possible_duplicate", duplicateTransactionId: "tx-dup" }),
      buildRow("row-3", { reviewStatus: "invalid" }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    // 1. Y = Total importable rows. Y should exclude invalid rows but include overrideable duplicates.
    // row-1 (valid) and row-2 (duplicate) are importable, row-3 (invalid) is not. Y = 2.
    // 2. X = Currently included rows. row-1 is included, row-2 (duplicate) is excluded by default. X = 1.
    // Count summary text must be: "เลือก 1 จาก 2 รายการ"
    const countElement = container.querySelector('[aria-live="polite"]');
    expect(countElement).not.toBeNull();
    expect(countElement?.textContent).toContain("เลือก 1 จาก 2 รายการ");

    // Check confirm button count
    const confirmButton = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("ยืนยันการนำเข้าทั้งหมด"));
    expect(confirmButton?.textContent).toContain("ยืนยันการนำเข้าทั้งหมด (1 รายการ)");

    // Verify row buttons and states
    const rowButtons = container.querySelectorAll("button[aria-pressed]");
    expect(rowButtons.length).toBe(3);

    // Row 1 (Ready) - should display "ไม่นำเข้า" (meaning it is included, so clicking excludes it)
    expect(rowButtons[0].textContent).toBe("ไม่นำเข้า");
    expect(rowButtons[0].getAttribute("aria-pressed")).toBe("true");

    // Row 2 (Duplicate) - should display "นำเข้า" (meaning it is excluded, clicking includes it)
    expect(rowButtons[1].textContent).toBe("นำเข้า");
    expect(rowButtons[1].getAttribute("aria-pressed")).toBe("false");

    // Row 3 (Invalid) - should be disabled and show "ข้อมูลไม่ครบ"
    expect(rowButtons[2].textContent).toBe("ข้อมูลไม่ครบ");
    expect(rowButtons[2].getAttribute("disabled")).toBe("");
  });

  it("toggles row exclusion and updates summary count immediately", async () => {
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready" }),
      buildRow("row-2", { reviewStatus: "ready" }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const countElement = container.querySelector('[aria-live="polite"]');
    expect(countElement?.textContent).toContain("เลือก 2 จาก 2 รายการ");

    const rowButtons = container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]");

    // Click first row's button to exclude it
    await act(async () => {
      rowButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Counts must update immediately
    expect(countElement?.textContent).toContain("เลือก 1 จาก 2 รายการ");
    expect(rowButtons[0].textContent).toBe("นำเข้า");
    expect(rowButtons[0].getAttribute("aria-pressed")).toBe("false");

    // Click again to re-include
    await act(async () => {
      rowButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(countElement?.textContent).toContain("เลือก 2 จาก 2 รายการ");
    expect(rowButtons[0].textContent).toBe("ไม่นำเข้า");
  });

  it("selects all and clears all correct bulk behaviors", async () => {
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready" }),
      buildRow("row-2", { reviewStatus: "possible_duplicate" }),
      buildRow("row-3", { reviewStatus: "invalid" }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const countElement = container.querySelector('[aria-live="polite"]');
    const selectAllBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "เลือกทั้งหมด");
    const clearAllBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "ยกเลิกทั้งหมด");

    expect(selectAllBtn).toBeDefined();
    expect(clearAllBtn).toBeDefined();

    // 1. Click Exclude All
    await act(async () => {
      clearAllBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(countElement?.textContent).toContain("เลือก 0 จาก 2 รายการ");

    // 2. Click Select All (should include row-1 and row-2, row-3 remains excluded)
    await act(async () => {
      selectAllBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(countElement?.textContent).toContain("เลือก 2 จาก 2 รายการ");
  });

  it("builds import payload with only included rows and preserves stable ordering", async () => {
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready", amountSatang: 1000 }),
      buildRow("row-2", { reviewStatus: "ready", amountSatang: 2000 }),
      buildRow("row-3", { reviewStatus: "possible_duplicate", amountSatang: 3000 }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    // Currently included: row-1, row-2. row-3 is excluded.
    const confirmButton = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("ยืนยันการนำเข้าทั้งหมด"));

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Verify confirmBatchAction is called with only row-1 and row-2
    expect(confirmBatchAction).toHaveBeenCalledOnce();
    const args = vi.mocked(confirmBatchAction).mock.calls[0];
    expect(args[0]).toBe("batch-1");
    expect(args[1]).toBe("account-1");

    const payload = args[2];
    expect(payload.length).toBe(2);
    expect(payload[0].rowId).toBe("row-1");
    expect(payload[0].decision).toBe("import");
    expect(payload[1].rowId).toBe("row-2");
    expect(payload[1].decision).toBe("import");
  });

  it("ensures rerenders and field edits do not reset user selections", async () => {
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready", merchant: "Store A" }),
      buildRow("row-2", { reviewStatus: "ready", merchant: "Store B" }),
    ];

    const root = createRoot(container);
    
    // First render
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const countElement = container.querySelector('[aria-live="polite"]');
    expect(countElement?.textContent).toContain("เลือก 2 จาก 2 รายการ");

    // Exclude row-1
    const rowButtons = container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]");
    await act(async () => {
      rowButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(countElement?.textContent).toContain("เลือก 1 จาก 2 รายการ");

    // 1. Simulate field edit
    // Expand row-1 (click card)
    const rowCard = container.querySelector(".cursor-pointer");
    await act(async () => {
      rowCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const merchantInput = container.querySelector<HTMLInputElement>("input[type='text']");
    expect(merchantInput).not.toBeNull();

    await act(async () => {
      if (merchantInput) {
        merchantInput.value = "New Merchant Name";
        merchantInput.dispatchEvent(new Event("input", { bubbles: true }));
        merchantInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    // Exclusions must persist after editing fields
    expect(countElement?.textContent).toContain("เลือก 1 จาก 2 รายการ");

    // 2. Simulating component rerender by rendering the same component again with new props
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    expect(countElement?.textContent).toContain("เลือก 1 จาก 2 รายการ");
  });

  it("implements ARIA accessibility requirements and keyboard activations", async () => {
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready", description: "GrabFood", amountSatang: 35000 }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const button = container.querySelector<HTMLButtonElement>("button[aria-pressed]");
    expect(button).not.toBeNull();

    // Contextual label contains description and formatted amount
    expect(button?.getAttribute("aria-label")).toContain("GrabFood");
    expect(button?.getAttribute("aria-label")).toContain("฿350");
    expect(button?.getAttribute("aria-label")).toContain("ไม่นำเข้ารายการนี้");

    // Aria-pressed reflects inclusion state
    expect(button?.getAttribute("aria-pressed")).toBe("true");

    // Keyboard Space trigger to toggle exclusion
    await act(async () => {
      button?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });

    const countElement = container.querySelector('[aria-live="polite"]');
    expect(countElement?.textContent).toContain("เลือก 0 จาก 1 รายการ");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(button?.getAttribute("aria-label")).toContain("นำเข้ารายการนี้");
  });
});
