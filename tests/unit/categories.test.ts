import { describe, expect, it } from "vitest";
import {
  ALL_CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCategoryById,
  getCategoryByLabel,
  listBudgetableExpenseCategories,
  resolveCategoryFromLegacyLabel,
  DEFAULT_EXPENSE_CATEGORY_ID,
  DEFAULT_INCOME_CATEGORY_ID,
} from "@/lib/finance/categories";

describe("category catalog integrity", () => {
  it("has 22 expense categories and 8 income categories", () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(22);
    expect(INCOME_CATEGORIES).toHaveLength(8);
  });

  it("has unique ids across the entire catalog", () => {
    const ids = ALL_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique labels across the entire catalog", () => {
    const labels = ALL_CATEGORIES.map((category) => category.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("every category is resolvable by its own id", () => {
    for (const category of ALL_CATEGORIES) {
      expect(getCategoryById(category.id)).toEqual(category);
    }
  });

  it("every category is resolvable by its own canonical label", () => {
    for (const category of ALL_CATEGORIES) {
      expect(getCategoryByLabel(category.label)).toEqual(category);
    }
  });

  it("default fallback ids exist in the catalog and match kind", () => {
    const defaultExpense = getCategoryById(DEFAULT_EXPENSE_CATEGORY_ID);
    const defaultIncome = getCategoryById(DEFAULT_INCOME_CATEGORY_ID);
    expect(defaultExpense?.kind).toBe("expense");
    expect(defaultIncome?.kind).toBe("income");
  });

  it("transfers is not budgetable (an own-account transfer is not spending)", () => {
    const transfers = getCategoryById("transfers");
    expect(transfers?.budgetable).toBe(false);
  });

  it("income categories are never budgetable", () => {
    for (const category of INCOME_CATEGORIES) {
      expect(category.budgetable).toBe(false);
    }
  });
});

describe("listBudgetableExpenseCategories", () => {
  it("includes every active, budgetable expense category and excludes transfers", () => {
    const budgetable = listBudgetableExpenseCategories();
    expect(budgetable.every((category) => category.kind === "expense" && category.budgetable && category.active)).toBe(true);
    expect(budgetable.find((category) => category.id === "transfers")).toBeUndefined();
    expect(budgetable.find((category) => category.id === "food")).toBeDefined();
  });
});

describe("resolveCategoryFromLegacyLabel", () => {
  it("resolves the canonical label to itself", () => {
    expect(resolveCategoryFromLegacyLabel("อาหารและเครื่องดื่ม")?.id).toBe("food");
  });

  it("resolves known legacy Thai labels from Part G's examples", () => {
    expect(resolveCategoryFromLegacyLabel("อาหาร")?.id).toBe("food");
    expect(resolveCategoryFromLegacyLabel("กิน")?.id).toBe("food");
    expect(resolveCategoryFromLegacyLabel("กาแฟ")?.id).toBe("food");
    expect(resolveCategoryFromLegacyLabel("ของใช้")?.id).toBe("groceries");
    expect(resolveCategoryFromLegacyLabel("ซูเปอร์")?.id).toBe("groceries");
    expect(resolveCategoryFromLegacyLabel("ซูเปอร์มาร์เก็ต")?.id).toBe("groceries");
    expect(resolveCategoryFromLegacyLabel("เดินทาง")?.id).toBe("transport");
    expect(resolveCategoryFromLegacyLabel("รถ")?.id).toBe("transport");
    expect(resolveCategoryFromLegacyLabel("MRT")?.id).toBe("transport");
    expect(resolveCategoryFromLegacyLabel("BTS")?.id).toBe("transport");
    expect(resolveCategoryFromLegacyLabel("อื่น ๆ")?.id).toBe("other");
    expect(resolveCategoryFromLegacyLabel("อื่นๆ")?.id).toBe("other");
  });

  it("resolves the pre-existing DB-seeded legacy category labels", () => {
    expect(resolveCategoryFromLegacyLabel("เดลิเวอรี")?.id).toBe("food");
    expect(resolveCategoryFromLegacyLabel("ที่พัก")?.id).toBe("housing");
    expect(resolveCategoryFromLegacyLabel("สุขภาพ")?.id).toBe("health");
    expect(resolveCategoryFromLegacyLabel("ครอบครัว")?.id).toBe("family");
    expect(resolveCategoryFromLegacyLabel("Subscription")?.id).toBe("subscriptions");
    expect(resolveCategoryFromLegacyLabel("ช้อปปิ้ง")?.id).toBe("shopping");
    expect(resolveCategoryFromLegacyLabel("หนี้สิน")?.id).toBe("debt");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveCategoryFromLegacyLabel("  subscription  ")?.id).toBe("subscriptions");
    expect(resolveCategoryFromLegacyLabel("SHOPPING")?.id).toBe("shopping");
  });

  it("returns undefined for an unrecognized legacy category (caller must choose the safe fallback)", () => {
    expect(resolveCategoryFromLegacyLabel("ของเล่นแมวบิน")).toBeUndefined();
    expect(resolveCategoryFromLegacyLabel(undefined)).toBeUndefined();
    expect(resolveCategoryFromLegacyLabel(null)).toBeUndefined();
    expect(resolveCategoryFromLegacyLabel("")).toBeUndefined();
    expect(resolveCategoryFromLegacyLabel("   ")).toBeUndefined();
  });
});
