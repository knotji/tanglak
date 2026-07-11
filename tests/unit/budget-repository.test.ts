import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyPreviousMonthBudget,
  createBudgetCategory,
  deleteBudgetCategory,
  getMonthlyBudget,
  listBudgetCategories,
  updateBudgetCategory,
  upsertMonthlyBudget,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import { MONEY_ERROR_NEGATIVE_TH } from "@/lib/finance/money-guards";
import { BUDGET_ERROR_DUPLICATE_TH, BUDGET_ERROR_NOT_FOUND_TH } from "@/lib/finance/budget-guards";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
  };
});

describe("monthly budget repository", () => {
  beforeEach(() => {
    const state = getMockState();
    state.monthlyBudgets = [];
    state.budgetCategories = [];
    state.transactions = [];
    state.users.clear();
  });

  it("creates a monthly budget on first upsert (first-time setup)", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    expect(budget.month).toBe("2026-07");
    expect(budget.incomeSatang).toBe(30_000_00);
    const state = getMockState();
    expect(state.monthlyBudgets).toHaveLength(1);
  });

  it("updates income in place on a second upsert for the same month (edit income), without creating a duplicate row", async () => {
    await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const updated = await upsertMonthlyBudget("user-a", "2026-07", 35_000_00);
    expect(updated.incomeSatang).toBe(35_000_00);
    const state = getMockState();
    expect(state.monthlyBudgets).toHaveLength(1);
  });

  it("rejects a negative income", async () => {
    await expect(upsertMonthlyBudget("user-a", "2026-07", -100)).rejects.toThrow(MONEY_ERROR_NEGATIVE_TH);
  });

  it("accepts zero income", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 0);
    expect(budget.incomeSatang).toBe(0);
  });

  it("rejects an invalid month key", async () => {
    await expect(upsertMonthlyBudget("user-a", "not-a-month", 1_000)).rejects.toThrow();
    await expect(upsertMonthlyBudget("user-a", "2026-13", 1_000)).rejects.toThrow();
  });

  it("adds a category budget", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 5_000_00);
    expect(category.label).toBe("อาหาร");
    expect(category.amountSatang).toBe(5_000_00);
  });

  it("rejects a duplicate category label within the same month's budget", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await createBudgetCategory("user-a", budget.id, "อาหาร", 5_000_00);
    await expect(createBudgetCategory("user-a", budget.id, "อาหาร", 1_000_00)).rejects.toThrow(
      BUDGET_ERROR_DUPLICATE_TH,
    );
  });

  it("allows the same category label in two different months (no cross-month collision)", async () => {
    const julyBudget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const augustBudget = await upsertMonthlyBudget("user-a", "2026-08", 30_000_00);
    await createBudgetCategory("user-a", julyBudget.id, "อาหาร", 5_000_00);
    await expect(createBudgetCategory("user-a", augustBudget.id, "อาหาร", 5_000_00)).resolves.toBeTruthy();
  });

  it("rejects a negative category budget", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await expect(createBudgetCategory("user-a", budget.id, "อาหาร", -1)).rejects.toThrow(MONEY_ERROR_NEGATIVE_TH);
  });

  it("accepts a zero category budget", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 0);
    expect(category.amountSatang).toBe(0);
  });

  it("rejects malformed amounts (NaN/Infinity/garbage) without silently coercing them", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await expect(createBudgetCategory("user-a", budget.id, "อาหาร", Number.NaN)).rejects.toThrow();
    await expect(createBudgetCategory("user-a", budget.id, "อาหาร", Number.POSITIVE_INFINITY)).rejects.toThrow();
  });

  it("edits a category budget amount", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 5_000_00);
    const updated = await updateBudgetCategory("user-a", category.id, 6_000_00);
    expect(updated.amountSatang).toBe(6_000_00);
  });

  it("removes a category budget", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 5_000_00);
    await deleteBudgetCategory("user-a", category.id);
    const remaining = await listBudgetCategories("user-a", budget.id);
    expect(remaining).toHaveLength(0);
  });

  it("another user cannot read another user's budget", async () => {
    await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const otherView = await getMonthlyBudget("user-b", "2026-07");
    expect(otherView).toBeNull();
  });

  it("another user cannot edit another user's category budget", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 5_000_00);
    await expect(updateBudgetCategory("user-b", category.id, 1)).rejects.toThrow();
  });

  it("another user cannot delete another user's category budget", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    const category = await createBudgetCategory("user-a", budget.id, "อาหาร", 5_000_00);
    await expect(deleteBudgetCategory("user-b", category.id)).rejects.toThrow();
    const remaining = await listBudgetCategories("user-a", budget.id);
    expect(remaining).toHaveLength(1); // untouched
  });

  it("another user cannot add a category to another user's budget", async () => {
    const budget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await expect(createBudgetCategory("user-b", budget.id, "อาหาร", 1_000)).rejects.toThrow(BUDGET_ERROR_NOT_FOUND_TH);
  });
});

describe("copy previous month budget", () => {
  beforeEach(() => {
    const state = getMockState();
    state.monthlyBudgets = [];
    state.budgetCategories = [];
    state.transactions = [];
    state.users.clear();
  });

  it("copies income and all categories into a fresh target month", async () => {
    const julyBudget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await createBudgetCategory("user-a", julyBudget.id, "อาหาร", 5_000_00);
    await createBudgetCategory("user-a", julyBudget.id, "เดินทาง", 2_000_00);

    const result = await copyPreviousMonthBudget("user-a", "2026-07", "2026-08");
    expect(result.copiedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.budget.incomeSatang).toBe(30_000_00);

    const augustCategories = await listBudgetCategories("user-a", result.budget.id);
    expect(augustCategories.map((c) => c.label).sort()).toEqual(["อาหาร", "เดินทาง"].sort());
  });

  it("throws the safe not-found message when the source month has no budget", async () => {
    await expect(copyPreviousMonthBudget("user-a", "2026-07", "2026-08")).rejects.toThrow(BUDGET_ERROR_NOT_FOUND_TH);
  });

  it("retrying the copy does not create duplicate categories (idempotent)", async () => {
    const julyBudget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await createBudgetCategory("user-a", julyBudget.id, "อาหาร", 5_000_00);

    const first = await copyPreviousMonthBudget("user-a", "2026-07", "2026-08");
    expect(first.copiedCount).toBe(1);

    const second = await copyPreviousMonthBudget("user-a", "2026-07", "2026-08");
    expect(second.copiedCount).toBe(0);
    expect(second.skippedCount).toBe(1);

    const augustCategories = await listBudgetCategories("user-a", second.budget.id);
    expect(augustCategories).toHaveLength(1); // not duplicated
  });

  it("does not overwrite an already-edited target month's income on retry", async () => {
    const julyBudget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await createBudgetCategory("user-a", julyBudget.id, "อาหาร", 5_000_00);
    await copyPreviousMonthBudget("user-a", "2026-07", "2026-08");

    // User manually edits August's income after the first copy.
    const augustBudget = (await getMonthlyBudget("user-a", "2026-08"))!;
    await upsertMonthlyBudget("user-a", "2026-08", 99_999_00);

    // Retry the copy -- income must remain the user's edited value, not reset to July's.
    const retry = await copyPreviousMonthBudget("user-a", "2026-07", "2026-08");
    expect(retry.budget.incomeSatang).toBe(99_999_00);
    expect(retry.budget.id).toBe(augustBudget.id);
  });

  it("copy is ownership scoped: another user's source budget is not found", async () => {
    const julyBudget = await upsertMonthlyBudget("user-a", "2026-07", 30_000_00);
    await createBudgetCategory("user-a", julyBudget.id, "อาหาร", 5_000_00);

    await expect(copyPreviousMonthBudget("user-b", "2026-07", "2026-08")).rejects.toThrow(BUDGET_ERROR_NOT_FOUND_TH);
    const state = getMockState();
    expect(state.monthlyBudgets.filter((b) => b.userId === "user-b")).toHaveLength(0);
  });
});
