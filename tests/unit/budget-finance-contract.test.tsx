import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MoneyAmount } from "@/components/MoneyAmount";
import {
  BudgetProgress,
  BudgetStatusBadge,
  CategoryBudgetRow,
  FinancialMetricCard,
  MonthSelector,
} from "@/components/finance";
import { buildBudgetSummary, summarizeCategory } from "@/lib/finance/budget-calculations";
import type { BudgetCategory, MonthlyBudget, Transaction } from "@/types/domain";

/**
 * Contract tests proving `budget-calculations.ts` output (the monthly
 * budget engine) can be rendered directly by the finance UI primitives
 * without any translation layer -- and, where a translation gap exists,
 * making that gap an explicit, visible assertion rather than a silent
 * mismatch.
 */

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

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? "tx",
    userId: "user-a",
    type: "expense",
    status: "confirmed",
    amountSatang: 10_000,
    currency: "THB",
    occurredAt: "2026-07-10T12:00:00+07:00",
    source: "manual",
    ...overrides,
  };
}

function budget(overrides: Partial<MonthlyBudget> = {}): MonthlyBudget {
  return {
    id: "budget-1",
    userId: "user-a",
    month: "2026-07",
    incomeSatang: 300_000,
    strategy: "minimum_first",
    status: "draft",
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

function category(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: "cat-1",
    userId: "user-a",
    monthlyBudgetId: "budget-1",
    label: "อาหาร",
    amountSatang: 1_000,
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("budget engine -> finance primitives contract", () => {
  it("renders a healthy category summary through MoneyAmount, BudgetStatusBadge, BudgetProgress, and CategoryBudgetRow", () => {
    const summary = summarizeCategory("อาหาร", 1_000, 500, "cat-1");
    expect(summary.status).toBe("healthy");

    const { container, root } = render(
      <div>
        <MoneyAmount satang={summary.spentSatang} />
        <BudgetStatusBadge status={summary.status} />
        <BudgetProgress label={summary.label} spentSatang={summary.spentSatang} budgetSatang={summary.budgetedSatang} />
        <CategoryBudgetRow category={summary.label} spentSatang={summary.spentSatang} budgetSatang={summary.budgetedSatang} />
      </div>,
    );
    expect(container.textContent).toContain("฿5");
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy();
    cleanup(root, container);
  });

  it("renders a near_limit category summary (80%-100% usage)", () => {
    const summary = summarizeCategory("เดินทาง", 1_000, 850);
    expect(summary.status).toBe("near_limit");

    const { container, root } = render(<BudgetStatusBadge status={summary.status} />);
    expect(container.textContent).toContain("ใกล้ถึงงบ");
    cleanup(root, container);
  });

  it("renders an overspent category summary (>100% usage) with matching progress overspend text", () => {
    const summary = summarizeCategory("ช้อปปิ้ง", 1_000, 1_500);
    expect(summary.status).toBe("overspent");

    const { container, root } = render(
      <BudgetProgress label={summary.label} spentSatang={summary.spentSatang} budgetSatang={summary.budgetedSatang} />,
    );
    expect(container.textContent).toContain("ใช้เกินงบ");
    cleanup(root, container);
  });

  it("renders a no_budget category summary (nothing allocated, nothing spent)", () => {
    const summary = summarizeCategory("บันเทิง", 0, 0);
    expect(summary.status).toBe("no_budget");

    const { container, root } = render(
      <BudgetProgress label={summary.label} spentSatang={summary.spentSatang} budgetSatang={summary.budgetedSatang} />,
    );
    expect(container.textContent).toContain("ยังไม่ตั้งงบ");
    cleanup(root, container);
  });

  it("documents the zero-budget-with-spending status divergence between the engine and BudgetProgress/CategoryBudgetRow", () => {
    // The engine deliberately classifies a zero-budget category with actual
    // spending as "overspent", never "no_budget" or "healthy" -- see
    // statusForCategory in budget-calculations.ts and
    // docs/MONTHLY_BUDGET_ENGINE.md.
    const summary = summarizeCategory("เดินทาง", 0, 500);
    expect(summary.status).toBe("overspent");

    // BudgetStatusBadge takes the engine's status directly and is fully
    // consistent with it -- rendering the badge with the engine's own
    // "overspent" status shows overspent styling/copy, with no translation.
    const badge = render(<BudgetStatusBadge status={summary.status} />);
    expect(badge.container.textContent).toContain("เกินงบ");
    cleanup(badge.root, badge.container);

    // BudgetProgress and CategoryBudgetRow, however, do NOT accept a status
    // prop -- they recompute status internally from raw spent/budget
    // numbers via `statusForBudget` (status.ts), which classifies this same
    // zero-budget-with-spending case as "no_budget", not "overspent". This
    // is a real, currently undocumented-in-code contract mismatch between
    // the engine and these two specific primitives (BudgetStatusBadge is
    // unaffected because it takes status directly). This test exists so the
    // divergence cannot silently regress or silently disappear -- it must
    // be deliberately resolved (e.g. by giving BudgetProgress a
    // status-override prop) in a future change, not fixed by editing
    // thresholds quietly.
    const progress = render(
      <BudgetProgress label={summary.label} spentSatang={summary.spentSatang} budgetSatang={summary.budgetedSatang} />,
    );
    expect(progress.container.textContent).toContain("ยังไม่ตั้งงบ");
    expect(progress.container.textContent).not.toContain("เกินงบ");
    cleanup(progress.root, progress.container);
  });

  it("renders uncategorized spend via FinancialMetricCard", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget(),
      [],
      [tx({ type: "expense", category: undefined, amountSatang: 750 })],
    );
    expect(summary.uncategorizedSpentSatang).toBe(750);

    const { container, root } = render(
      <FinancialMetricCard label="ยังไม่จัดหมวดหมู่" amountSatang={summary.uncategorizedSpentSatang} tone="expense" />,
    );
    expect(container.textContent).toContain("฿7.5");
    cleanup(root, container);
  });

  it("renders a negative remaining total (overspent budget) via MoneyAmount with expense tone", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget({ incomeSatang: 10_000 }),
      [category({ label: "อาหาร", amountSatang: 1_000 })],
      [tx({ type: "expense", category: "อาหาร", amountSatang: 1_500 })],
    );
    expect(summary.remainingTotalSatang).toBeLessThan(0);

    const { container, root } = render(
      <MoneyAmount satang={summary.remainingTotalSatang} tone="expense" />,
    );
    expect(container.textContent).toContain("-");
    cleanup(root, container);
  });

  it("renders the no-monthly-budget state (hasBudget=false) via FinancialMetricCard and MonthSelector without throwing", () => {
    const summary = buildBudgetSummary("2026-07", null, [], []);
    expect(summary.hasBudget).toBe(false);
    expect(summary.status).toBe("no_budget");

    const { container, root } = render(
      <div>
        <FinancialMetricCard label="งบที่วางแผนไว้" amountSatang={summary.plannedTotalSatang} />
        <FinancialMetricCard label="ใช้ไปแล้ว" amountSatang={summary.spentTotalSatang} />
        <MonthSelector value={summary.month} currentMonth="2026-07" onMonthChange={() => undefined} />
      </div>,
    );
    expect(container.textContent).toContain("฿0");
    expect(container.textContent).toContain("2026-07");
    cleanup(root, container);
  });

  it("renders every category summary produced by buildBudgetSummary (including a budget-less category) through CategoryBudgetRow", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget(),
      [category({ label: "อาหาร", amountSatang: 1_000 })],
      [
        tx({ id: "a", type: "expense", category: "อาหาร", amountSatang: 1_000 }),
        tx({ id: "b", type: "expense", category: "เดินทาง", amountSatang: 500 }), // no budget row
      ],
    );
    expect(summary.categories).toHaveLength(2);

    const { container, root } = render(
      <div>
        {summary.categories.map((c) => (
          <CategoryBudgetRow key={c.label} category={c.label} spentSatang={c.spentSatang} budgetSatang={c.budgetedSatang} />
        ))}
      </div>,
    );
    expect(container.textContent).toContain("อาหาร");
    expect(container.textContent).toContain("เดินทาง");
    cleanup(root, container);
  });
});
