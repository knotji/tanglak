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

function typeInInput(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function buildBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: "batch-1",
    userId: "user-1",
    accountId: "account-1",
    status: "processing",
    sourceType: "pdf",
    pageCount: 1,
    originalFilename: "statement.pdf",
    mimeType: "application/pdf",
    storagePath: "mock/path/statement.pdf",
    fileSize: 1024,
    totalRows: 3,
    parsedRows: 3,
    readyRows: 2,
    duplicateRows: 1,
    reviewRows: 0,
    skippedRows: 0,
    importedRows: 0,
    failedRows: 0,
    createdAt: "2026-07-11T09:00:00Z",
    updatedAt: "2026-07-11T09:00:00Z",
    ...overrides,
  };
}

function buildRow(id: string, overrides: Partial<ImportRow> = {}): ImportRow {
  const status = overrides.reviewStatus || "ready";
  const defaultDecision = status === "ready" ? "import" : "unresolved";
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
    reviewStatus: status,
    importDecision: defaultDecision,
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
    const rowButtons = container.querySelectorAll("#transaction-list-container button[aria-pressed]");
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

    const rowButtons = container.querySelectorAll<HTMLButtonElement>("#transaction-list-container button[aria-pressed]");

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

    // Verify confirmBatchAction is called with all rows (including skipped duplicates)
    expect(confirmBatchAction).toHaveBeenCalledOnce();
    const args = vi.mocked(confirmBatchAction).mock.calls[0];
    expect(args[0]).toBe("batch-1");
    expect(args[1]).toBe("account-1");

    const payload = args[2];
    expect(payload.length).toBe(3);
    expect(payload[0].rowId).toBe("row-1");
    expect(payload[0].decision).toBe("import");
    expect(payload[1].rowId).toBe("row-2");
    expect(payload[1].decision).toBe("import");
    expect(payload[2].rowId).toBe("row-3");
    expect(payload[2].decision).toBe("skip");
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
    const rowButtons = container.querySelectorAll<HTMLButtonElement>("#transaction-list-container button[aria-pressed]");
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

    const button = container.querySelector<HTMLButtonElement>("#transaction-list-container button[aria-pressed]");
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

  it("renders collapsed rows by default and expands them inline on body click", async () => {
    const batch = buildBatch();
    const rows = [buildRow("row-1", { reviewStatus: "ready", description: "GrabFood" })];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const rowBody = container.querySelector<HTMLDivElement>("#row-body-row-1");
    expect(rowBody).not.toBeNull();
    expect(rowBody?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#edit-form-row-1")).toBeNull();

    // Click to expand
    await act(async () => {
      rowBody?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(rowBody?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#edit-form-row-1")).not.toBeNull();
  });

  it("auto-expands first invalid or warning row on mount", async () => {
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready" }),
      buildRow("row-2", { reviewStatus: "invalid" }), // Invalid row
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    // Invalid row should auto-expand
    expect(container.querySelector("#row-body-row-2")?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#row-body-row-1")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("calculates filter chip counts dynamically based on active search text", async () => {
    vi.useFakeTimers();
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready", description: "GrabFood BKK" }),
      buildRow("row-2", { reviewStatus: "possible_duplicate", description: "GrabFood CNX" }),
      buildRow("row-3", { reviewStatus: "ready", description: "Starbucks Store" }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    // Enter search query
    const searchInput = container.querySelector<HTMLInputElement>("#search-input");
    await act(async () => {
      if (searchInput) {
        typeInInput(searchInput, "GrabFood");
      }
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Counts on tablist should reflect only GrabFood rows (2 items)
    const allTab = Array.from(container.querySelectorAll('[role="tab"]')).find(t => t.textContent?.includes("ทั้งหมด"));
    const duplicateTab = Array.from(container.querySelectorAll('[role="tab"]')).find(t => t.textContent?.includes("รายการซ้ำ"));

    expect(allTab?.textContent).toContain("ทั้งหมด (2)");
    expect(duplicateTab?.textContent).toContain("รายการซ้ำ (1)");

    vi.useRealTimers();
  });

  it("filters rows based on search query with debouncing", async () => {
    vi.useFakeTimers();
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { description: "7-Eleven Store" }),
      buildRow("row-2", { description: "Starbucks Cafe" }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const searchInput = container.querySelector<HTMLInputElement>("#search-input");
    await act(async () => {
      if (searchInput) {
        typeInInput(searchInput, "Starbucks");
      }
    });

    // Fast-forward debounce time (150ms)
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(container.querySelectorAll('[id^="row-card-"]').length).toBe(1);
    expect(container.querySelector("#row-card-row-2")).not.toBeNull();
    expect(container.querySelector("#row-card-row-1")).toBeNull();

    vi.useRealTimers();
  });

  it("clears search query when clicking clear button", async () => {
    vi.useFakeTimers();
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { description: "7-Eleven Store" }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const searchInput = container.querySelector<HTMLInputElement>("#search-input");
    await act(async () => {
      if (searchInput) {
        typeInInput(searchInput, "7-Eleven");
      }
    });

    const clearBtn = Array.from(container.querySelectorAll("button")).find(b => b.getAttribute("aria-label") === "ล้างการค้นหา");
    expect(clearBtn).not.toBeUndefined();

    await act(async () => {
      clearBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(searchInput?.value).toBe("");
    
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    
    expect(container.querySelectorAll('[id^="row-card-"]').length).toBe(1);
    vi.useRealTimers();
  });

  it("performs warnings jump-to-next navigation and first-excluded navigation", async () => {
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready" }),
      buildRow("row-2", { reviewStatus: "possible_duplicate" }),
      buildRow("row-3", { reviewStatus: "ready", validationWarnings: ["Warning text"] }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const nextWarningBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("ถัดไปที่ต้องตรวจสอบ"));
    const firstExcludedBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("รายการแรกที่ไม่นำเข้า"));

    expect(nextWarningBtn).not.toBeUndefined();
    expect(firstExcludedBtn).not.toBeUndefined();

    const mockScroll = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = mockScroll;

    // On mount, the first warning row (row-2) should already be expanded
    expect(container.querySelector("#row-body-row-2")?.getAttribute("aria-expanded")).toBe("true");

    // Next Warning -> row-3
    await act(async () => {
      nextWarningBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("#row-body-row-3")?.getAttribute("aria-expanded")).toBe("true");

    // Next Warning (wraps around) -> row-2
    await act(async () => {
      nextWarningBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("#row-body-row-2")?.getAttribute("aria-expanded")).toBe("true");

    // First Excluded -> row-2 (duplicate candidate starts as excluded)
    await act(async () => {
      firstExcludedBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("#row-body-row-2")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("persists user selections when search query or filter changes", async () => {
    vi.useFakeTimers();
    const batch = buildBatch();
    const rows = [
      buildRow("row-1", { reviewStatus: "ready", description: "GrabFood" }),
      buildRow("row-2", { reviewStatus: "ready", description: "LineMan" }),
    ];

    const root = createRoot(container);
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });

    const row1Toggle = container.querySelector<HTMLButtonElement>("#row-card-row-1 button");
    await act(async () => {
      row1Toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector("#row-card-row-1")?.className).toContain("opacity-50");

    const searchInput = container.querySelector<HTMLInputElement>("#search-input");
    await act(async () => {
      if (searchInput) {
        typeInInput(searchInput, "Grab");
      }
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(container.querySelectorAll('[id^="row-card-"]').length).toBe(1);
    expect(container.querySelector("#row-card-row-1")?.className).toContain("opacity-50");

    await act(async () => {
      if (searchInput) {
        typeInInput(searchInput, "");
      }
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(container.querySelectorAll('[id^="row-card-"]').length).toBe(2);
    expect(container.querySelector("#row-card-row-1")?.className).toContain("opacity-50");
    
    vi.useRealTimers();
  });

  it("remains responsive and performs search/filter operations smoothly with 220+ rows", async () => {
    const batch = buildBatch();
    const rows = Array.from({ length: 220 }).map((_, i) =>
      buildRow(`row-${i}`, {
        description: i === 150 ? "Special Target Tx" : `Tx ${i}`,
        reviewStatus: "ready",
      })
    );

    const root = createRoot(container);
    const start = performance.now();
    await act(async () => {
      root.render(<ReviewBoardClient batch={batch} initialRows={rows} debts={[]} />);
    });
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(1000);

    vi.useFakeTimers();
    const searchInput = container.querySelector<HTMLInputElement>("#search-input");
    await act(async () => {
      if (searchInput) {
        typeInInput(searchInput, "Special Target Tx");
      }
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(container.querySelectorAll('[id^="row-card-"]').length).toBe(1);
    expect(container.querySelector("#row-card-row-150")).not.toBeNull();
    vi.useRealTimers();
  });
});
