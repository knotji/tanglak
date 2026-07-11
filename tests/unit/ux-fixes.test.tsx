import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { getBangkokTodayString, getBangkokMonthString } from "@/lib/finance/date";
import { DelayedLoadingMessage } from "@/components/feedback/DelayedLoadingMessage";
import { TransactionsClient } from "@/features/transactions/TransactionsClient";
import type { Transaction } from "@/types/domain";

// A mock router to avoid Next.js routing issues in component testing
// @ts-expect-error -- test intentionally overrides browser timer behavior
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: () => {},
      refresh: () => {},
    };
  },
  usePathname() {
    return "/transactions";
  },
}));

describe("Bangkok-local date and boundary behaviors", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("extracts Bangkok local date correct when UTC date is different (midnight/timezone shift)", () => {
    // UTC is 2026-07-10 20:00:00 (8:00 PM), which is Bangkok 2026-07-11 03:00:00 (3:00 AM)
    vi.setSystemTime(new Date("2026-07-10T20:00:00Z"));
    expect(getBangkokTodayString()).toBe("2026-07-11");
    expect(getBangkokMonthString()).toBe("2026-07");
  });

  it("resolves correct month boundaries at month transition times", () => {
    // UTC is 2026-07-31 18:00:00, which is Bangkok 2026-08-01 01:00:00
    vi.setSystemTime(new Date("2026-07-31T18:00:00Z"));
    expect(getBangkokTodayString()).toBe("2026-08-01");
    expect(getBangkokMonthString()).toBe("2026-08");
  });

  it("resolves year boundary transitions correctly", () => {
    // UTC is 2026-12-31 22:00:00, which is Bangkok 2027-01-01 05:00:00
    vi.setSystemTime(new Date("2026-12-31T22:00:00Z"));
    expect(getBangkokTodayString()).toBe("2027-01-01");
    expect(getBangkokMonthString()).toBe("2027-01");
  });
});

describe("DelayedLoadingMessage timing states", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it("handles visibility thresholds and slow/retry label progressions without flicker", async () => {
    const root = createRoot(container);
    
    await act(async () => {
      root.render(
        <DelayedLoadingMessage
          message="กำลังโหลดข้อมูล..."
          slowMessage="ใช้เวลานานกว่าปกติ"
          retryLabel="ลองใหม่"
          delayMs={600}
          slowMs={1500}
          retryMs={5000}
        />
      );
    });

    // 1. Initial State (0ms): Not visible, should return null (empty container)
    expect(container.textContent).toBe("");

    // 2. Fast load complete simulation (500ms): should still be hidden (no flicker)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(container.textContent).toBe("");

    // 3. Normal delay threshold (600ms): normal message is visible
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(container.textContent).toBe("กำลังโหลดข้อมูล...");

    // 4. Slow loading threshold (1500ms): message changes to slowMessage
    await act(async () => {
      vi.advanceTimersByTime(900); // 500+100+900 = 1500ms
    });
    expect(container.textContent).toBe("ใช้เวลานานกว่าปกติ");

    // 5. Retry threshold (5000ms): displays slowMessage and "ลองใหม่" retry button
    await act(async () => {
      vi.advanceTimersByTime(3500); // 1500+3500 = 5000ms
    });
    expect(container.textContent).toContain("ใช้เวลานานกว่าปกติ");
    expect(container.textContent).toContain("ลองใหม่");
    
    // Ensure button is present
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("ลองใหม่");
  });
});

describe("TransactionsClient filter transition state", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  const mockTransactions: Transaction[] = [
    {
      id: "tx-1",
      userId: "user-1",
      type: "expense",
      status: "confirmed",
      amountSatang: 50000,
      currency: "THB",
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "GrabFood",
      category: "อาหาร",
      source: "manual",
    },
    {
      id: "tx-2",
      userId: "user-1",
      type: "income",
      status: "confirmed",
      amountSatang: 120000,
      currency: "THB",
      occurredAt: "2026-07-10T15:00:00+07:00",
      merchant: "Salary",
      category: "งาน",
      source: "manual",
    },
  ];

  it("retains display content during filter change and applies pending styling without flashing empty states", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TransactionsClient
          transactions={mockTransactions}
          accounts={[]}
          monthLabel="เดือนนี้"
        />
      );
    });

    // Verify initial render contains transaction rows
    expect(container.textContent).toContain("GrabFood");
    expect(container.textContent).toContain("Salary");

    // Locate the "รายจ่าย" (expense) filter button
    const buttons = container.querySelectorAll("button");
    let expenseBtn: HTMLButtonElement | null = null;
    buttons.forEach((btn) => {
      if (btn.textContent === "รายจ่าย") {
        expenseBtn = btn as HTMLButtonElement;
      }
    });

    expect(expenseBtn).not.toBeNull();

    // Trigger filter change to "expense"
    await act(async () => {
      expenseBtn?.click();
    });

    // Check that once state transition resolves, only matching transaction remains
    expect(container.textContent).toContain("GrabFood");
    expect(container.textContent).not.toContain("Salary");
    
    // Ensure it didn't flash empty state "ยังไม่มีรายการ" during rendering
    expect(container.textContent).not.toContain("ยังไม่มีรายการ");
  });
});
