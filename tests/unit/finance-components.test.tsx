import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoneyAmount } from "@/components/MoneyAmount";
import {
  BudgetProgress,
  BudgetStatusBadge,
  calculateBudgetPercentage,
  CompactTransactionRow,
  FinancialAlert,
  FinancialEmptyState,
  FinancialMetricCard,
  FinancialSkeleton,
  MonthSelector,
} from "@/components/finance";
import type { Transaction } from "@/types/domain";

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("financial UI primitives", () => {
  it("formats integer satang as baht without floating-point drift", () => {
    const { container, root } = render(<MoneyAmount satang={123456} />);
    const amount = container.querySelector("span");
    expect(amount?.textContent).toBe("฿1,234.56");
    expect(amount?.getAttribute("aria-label")).toContain("฿1,234.56");
    expect(amount?.getAttribute("aria-label")).toContain("ยอดเงิน");
    cleanup(root, container);
  });

  it("supports positive, negative, neutral, compact, and signed display semantics", () => {
    const { container, root } = render(
      <div>
        <MoneyAmount satang={250000} tone="income" showSign />
        <MoneyAmount satang={-150000} tone="expense" />
        <MoneyAmount satang={0} tone="neutral" />
        <MoneyAmount satang={125000000} format="compact" />
      </div>,
    );

    expect(container.textContent).toContain("+฿2,500");
    expect(container.textContent).toContain("-฿1,500");
    expect(container.textContent).toContain("฿0");
    expect(container.textContent).toContain("฿1.3M");
    expect(container.querySelector(".text-income")).toBeTruthy();
    expect(container.querySelector(".text-expense")).toBeTruthy();
    cleanup(root, container);
  });

  it("rejects non-integer satang values", () => {
    expect(() => render(<MoneyAmount satang={10.5} />)).toThrow("integer satang");
  });

  it("calculates budget percentages including overspending and zero-budget states", () => {
    expect(calculateBudgetPercentage(5000, 10000)).toBe(50);
    expect(calculateBudgetPercentage(12500, 10000)).toBe(125);
    expect(calculateBudgetPercentage(5000, 0)).toBe(Infinity);
    expect(calculateBudgetPercentage(0, 0)).toBe(0);
  });

  it("exposes accessible progress semantics and explains overspending above 100%", () => {
    const { container, root } = render(<BudgetProgress label="อาหาร" spentSatang={12500} budgetSatang={10000} />);
    const progress = container.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute("aria-valuemin")).toBe("0");
    expect(progress?.getAttribute("aria-valuemax")).toBe("100");
    expect(progress?.getAttribute("aria-valuenow")).toBe("100");
    expect(progress?.getAttribute("aria-valuetext")).toContain("125%");
    expect(container.textContent).toContain("ใช้เกินงบ 25%");
    cleanup(root, container);
  });

  it("shows a non-color cue for zero budget with spending", () => {
    const { container, root } = render(<BudgetProgress label="เดินทาง" spentSatang={5000} budgetSatang={0} />);
    expect(container.textContent).toContain("ยังไม่ตั้งงบ");
    expect(container.textContent).toContain("แต่มีการใช้จ่ายแล้ว");
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuetext")).toContain("ยังไม่ตั้งงบ");
    cleanup(root, container);
  });

  it("renders status badges with icon/text cues in addition to color", () => {
    const { container, root } = render(<BudgetStatusBadge status="near_limit" />);
    expect(container.textContent).toContain("ใกล้ถึงงบ");
    expect(container.textContent).toContain("ใกล้เต็มวงเงิน");
    expect(container.querySelector("svg")).toBeTruthy();
    cleanup(root, container);
  });

  it("renders loading and warning metric-card states accessibly", () => {
    const { container, root } = render(<FinancialMetricCard label="คงเหลือ" amountSatang={0} loading warning />);
    expect(container.textContent).toContain("คงเหลือ");
    expect(container.querySelector("[aria-hidden='true']")).toBeTruthy();
    expect(container.querySelector("[aria-label='คำเตือน']")).toBeTruthy();
    cleanup(root, container);
  });

  it("supports month navigation buttons and keyboard controls with canonical YYYY-MM values", () => {
    const onMonthChange = vi.fn();
    const { container, root } = render(
      <MonthSelector value="2026-05" currentMonth="2026-07" onMonthChange={onMonthChange} />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.find((button) => button.getAttribute("aria-label") === "เดือนก่อนหน้า")?.click();
    buttons.find((button) => button.getAttribute("aria-label") === "เดือนถัดไป")?.click();
    buttons.find((button) => button.getAttribute("aria-label") === "กลับไปเดือนนี้")?.click();
    container.firstElementChild?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    container.firstElementChild?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    container.firstElementChild?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));

    expect(container.textContent).toContain("2026-05");
    expect(onMonthChange.mock.calls.map((call) => call[0])).toEqual([
      "2026-04",
      "2026-06",
      "2026-07",
      "2026-04",
      "2026-06",
      "2026-07",
    ]);
    cleanup(root, container);
  });

  it("falls invalid month values back to the current Bangkok month", () => {
    const { container, root } = render(
      <MonthSelector value="2026-13" currentMonth="2026-07" onMonthChange={() => undefined} />,
    );
    expect(container.textContent).toContain("2026-07");
    cleanup(root, container);
  });

  it("renders compact transaction rows with imported indicator, contextual action, and overflow-safe classes", () => {
    const tx: Transaction = {
      id: "tx-1",
      userId: "user-1",
      type: "expense",
      status: "confirmed",
      amountSatang: 129900,
      currency: "THB",
      occurredAt: "2026-05-15T18:30:00+07:00",
      merchant: "Long merchant name that should truncate on small screens",
      category: "อาหาร",
      source: "history_import",
      importBatchId: "batch-1",
      isHistorical: true,
    };
    const onAction = vi.fn();
    const { container, root } = render(<CompactTransactionRow transaction={tx} actionLabel="แก้ไขรายการ" onAction={onAction} />);

    expect(container.textContent).toContain("นำเข้า");
    expect(container.querySelector("article")?.className).toContain("max-w-full");
    expect(container.querySelector("article")?.className).toContain("overflow-hidden");
    expect(container.querySelector(".min-w-0")).toBeTruthy();
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-label")).toContain("แก้ไขรายการ Long merchant name");
    button?.click();
    expect(onAction).toHaveBeenCalledWith(tx);
    cleanup(root, container);
  });

  it("renders empty, alert, and skeleton states with expected semantics", () => {
    const { container, root } = render(
      <div>
        <FinancialEmptyState title="ยังไม่มีรายการ" body="เพิ่มรายการแรกเพื่อเริ่มติดตามเงิน" />
        <FinancialAlert title="เกินงบ" tone="danger">ตรวจสอบรายการล่าสุด</FinancialAlert>
        <FinancialSkeleton rows={2} />
      </div>,
    );

    expect(container.textContent).toContain("ยังไม่มีรายการ");
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.querySelector("[aria-hidden='true']")).toBeTruthy();
    cleanup(root, container);
  });
});
