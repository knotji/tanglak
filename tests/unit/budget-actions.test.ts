import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockState } from "@/lib/data/mock-store";
import {
  BUDGET_ERROR_DUPLICATE_TH,
  BUDGET_ERROR_NOT_FOUND_TH,
  BUDGET_ERROR_NEGATIVE_TH,
  INCOME_ERROR_NEGATIVE_TH,
} from "@/lib/finance/budget-guards";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
    requireUser: vi.fn(async () => ({ id: "user-a", email: "user-a@example.test" })),
  };
});

import { requireUser } from "@/lib/auth/session";
import {
  copyPreviousMonthAction,
  deleteBudgetCategoryAction,
  saveBudgetCategoryAction,
  saveMonthlyIncomeAction,
} from "@/app/actions/budget";
import { createBudgetCategory, listBudgetCategories, upsertMonthlyBudget } from "@/lib/data/finance-repository";

function fd(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("budget server actions", () => {
  beforeEach(() => {
    const state = getMockState();
    state.monthlyBudgets = [];
    state.budgetCategories = [];
    state.transactions = [];
    state.users.clear();
    vi.mocked(requireUser).mockResolvedValue({ id: "user-a", email: "user-a@example.test" });
  });

  it("saveMonthlyIncomeAction rejects negative income with the income-specific Thai message", async () => {
    const result = await saveMonthlyIncomeAction({ ok: false }, fd({ month: "2026-07", income: "-100" }));
    expect(result).toEqual({ ok: false, message: INCOME_ERROR_NEGATIVE_TH });
  });

  it("saveMonthlyIncomeAction accepts zero income and creates the budget", async () => {
    const result = await saveMonthlyIncomeAction({ ok: false }, fd({ month: "2026-07", income: "0" }));
    expect(result.ok).toBe(true);
    const state = getMockState();
    expect(state.monthlyBudgets).toHaveLength(1);
    expect(state.monthlyBudgets[0]?.incomeSatang).toBe(0);
  });

  it("saveMonthlyIncomeAction accepts a positive comma-formatted amount", async () => {
    const result = await saveMonthlyIncomeAction({ ok: false }, fd({ month: "2026-07", income: "30,000" }));
    expect(result.ok).toBe(true);
    const state = getMockState();
    expect(state.monthlyBudgets[0]?.incomeSatang).toBe(30_000_00);
  });

  it("saveBudgetCategoryAction rejects a negative category amount with the budget-specific Thai message", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const result = await saveBudgetCategoryAction(
      { ok: false },
      fd({ month: "2026-07", monthlyBudgetId: budget.id, label: "อาหาร", amount: "-1" }),
    );
    expect(result).toEqual({ ok: false, message: BUDGET_ERROR_NEGATIVE_TH });
  });

  it("saveBudgetCategoryAction rejects a duplicate category label for the month", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await createBudgetCategory("user-a", budget.id, "อาหาร", 1_000_00);
    const result = await saveBudgetCategoryAction(
      { ok: false },
      fd({ month: "2026-07", monthlyBudgetId: budget.id, label: "อาหาร", amount: "2,000" }),
    );
    expect(result).toEqual({ ok: false, message: BUDGET_ERROR_DUPLICATE_TH });
  });

  it("saveBudgetCategoryAction with a categoryId updates the existing category (not create) without needing monthlyBudgetId", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 1_000_00);
    const result = await saveBudgetCategoryAction(
      { ok: false },
      fd({ month: "2026-07", categoryId: category.id, amount: "2,500" }),
    );
    expect(result.ok).toBe(true);
    const categories = await listBudgetCategories("user-a", budget.id);
    expect(categories[0]?.amountSatang).toBe(2_500_00);
  });

  it("deleteBudgetCategoryAction removes the category", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 1_000_00);
    const result = await deleteBudgetCategoryAction(category.id, "2026-07");
    expect(result.ok).toBe(true);
    const categories = await listBudgetCategories("user-a", budget.id);
    expect(categories).toHaveLength(0);
  });

  it("another authenticated user cannot delete user-a's category budget via the action", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 1_000_00);

    vi.mocked(requireUser).mockResolvedValue({ id: "user-b", email: "user-b@example.test" });
    const result = await deleteBudgetCategoryAction(category.id, "2026-07");
    expect(result.ok).toBe(false);

    const categories = await listBudgetCategories("user-a", budget.id);
    expect(categories).toHaveLength(1); // untouched
  });

  it("copyPreviousMonthAction copies categories and reports a safe not-found message when there is nothing to copy", async () => {
    const result = await copyPreviousMonthAction({ ok: false }, fd({ fromMonth: "2026-06", toMonth: "2026-07" }));
    expect(result.ok).toBe(false);
    expect(result.message).toBe(BUDGET_ERROR_NOT_FOUND_TH);
  });

  it("copyPreviousMonthAction succeeds and a second call reports categories already present, not an error", async () => {
    const juneBudget = await upsertMonthlyBudget("user-a", "2026-06", 20_000_00);
    await createBudgetCategory("user-a", juneBudget.id, "อาหาร", 4_000_00);

    const first = await copyPreviousMonthAction({ ok: false }, fd({ fromMonth: "2026-06", toMonth: "2026-07" }));
    expect(first.ok).toBe(true);

    const second = await copyPreviousMonthAction({ ok: false }, fd({ fromMonth: "2026-06", toMonth: "2026-07" }));
    expect(second.ok).toBe(true);
    expect(second.message).toContain("ครบแล้ว");
  });

  it("safe error messages never leak internal identifiers or stack details", async () => {
    const result = await saveBudgetCategoryAction(
      { ok: false },
      fd({ month: "2026-07", categoryId: "nonexistent-id", amount: "1,000" }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).not.toMatch(/at Object\.|at async|\.ts:\d+|postgres|relation "public\./i);
  });
});
