import { describe, expect, it } from "vitest";
import {
  categorizeByMerchantRule,
  categorizeStatementDescription,
  resolveExpenseCategoryLabel,
  resolveExtractedCategory,
} from "@/lib/finance/category-fallback";
import { getCategoryById } from "@/lib/finance/categories";

describe("categorizeByMerchantRule — Part D deterministic merchant rules", () => {
  it("matches known supermarkets to groceries", () => {
    expect(categorizeByMerchantRule("TOPS MARKET BKK")?.category.id).toBe("groceries");
    expect(categorizeByMerchantRule("Lotus's Bangna")?.category.id).toBe("groceries");
    expect(categorizeByMerchantRule("BIG C SUPERCENTER")?.category.id).toBe("groceries");
    expect(categorizeByMerchantRule("MAKRO SATHORN")?.category.id).toBe("groceries");
    expect(categorizeByMerchantRule("Gourmet Market Siam")?.category.id).toBe("groceries");
  });

  it("matches 7-Eleven to groceries by default", () => {
    expect(categorizeByMerchantRule("7-ELEVEN 1234")?.category.id).toBe("groceries");
  });

  it("matches known cafes to food", () => {
    expect(categorizeByMerchantRule("STARBUCKS THONGLOR")?.category.id).toBe("food");
    expect(categorizeByMerchantRule("CAFE AMAZON PTT")?.category.id).toBe("food");
  });

  it("matches food delivery apps to food", () => {
    expect(categorizeByMerchantRule("GRABFOOD ORDER 8821")?.category.id).toBe("food");
    expect(categorizeByMerchantRule("LINE MAN DELIVERY")?.category.id).toBe("food");
    expect(categorizeByMerchantRule("foodpanda BKK")?.category.id).toBe("food");
  });

  it("prefers the more specific 'grabfood' hint over the shorter 'grab' transport hint", () => {
    const match = categorizeByMerchantRule("GRABFOOD ORDER 8821");
    expect(match?.category.id).toBe("food");
    expect(match?.matchedHint).toBe("grabfood");
  });

  it("matches bare Grab (transport) and Bolt to transport", () => {
    expect(categorizeByMerchantRule("GRAB TRIP 5521")?.category.id).toBe("transport");
    expect(categorizeByMerchantRule("BOLT RIDE")?.category.id).toBe("transport");
  });

  it("matches BTS/MRT to transport", () => {
    expect(categorizeByMerchantRule("BTS SKYTRAIN TOPUP")?.category.id).toBe("transport");
    expect(categorizeByMerchantRule("MRT BLUE LINE")?.category.id).toBe("transport");
  });

  it("matches hospital/clinic/pharmacy to health", () => {
    expect(categorizeByMerchantRule("BUMRUNGRAD HOSPITAL")?.category.id).toBe("health");
    expect(categorizeByMerchantRule("โรงพยาบาลกรุงเทพ")?.category.id).toBe("health");
    expect(categorizeByMerchantRule("SOMKID CLINIC")?.category.id).toBe("health");
    expect(categorizeByMerchantRule("ร้านยาฟาสซิโน")?.category.id).toBe("health");
  });

  it("matches Netflix/Spotify/YouTube Premium to subscriptions", () => {
    expect(categorizeByMerchantRule("NETFLIX.COM")?.category.id).toBe("subscriptions");
    expect(categorizeByMerchantRule("SPOTIFY AB")?.category.id).toBe("subscriptions");
    expect(categorizeByMerchantRule("YouTube Premium")?.category.id).toBe("subscriptions");
  });

  it("matches Shopee/Lazada to shopping unless overridden by item-level context", () => {
    expect(categorizeByMerchantRule("SHOPEE THAILAND")?.category.id).toBe("shopping");
    expect(categorizeByMerchantRule("LAZADA CO LTD")?.category.id).toBe("shopping");
  });

  it("matches AIS/True/dtac to utilities", () => {
    expect(categorizeByMerchantRule("AIS BILL PAYMENT")?.category.id).toBe("utilities");
    expect(categorizeByMerchantRule("TRUE CORPORATION")?.category.id).toBe("utilities");
    expect(categorizeByMerchantRule("DTAC TRINET")?.category.id).toBe("utilities");
  });

  it("matches gym merchants to fitness", () => {
    expect(categorizeByMerchantRule("FITNESS FIRST SILOM")?.category.id).toBe("fitness");
  });

  it("matches known insurance companies to insurance", () => {
    expect(categorizeByMerchantRule("AIA THAILAND")?.category.id).toBe("insurance");
    expect(categorizeByMerchantRule("MUANG THAI INSURANCE")?.category.id).toBe("insurance");
  });

  it("returns undefined for text with no known merchant signal", () => {
    expect(categorizeByMerchantRule("XYZ RANDOM VENDOR 99")).toBeUndefined();
    expect(categorizeByMerchantRule(undefined)).toBeUndefined();
    expect(categorizeByMerchantRule("")).toBeUndefined();
  });

  it("is case-insensitive", () => {
    expect(categorizeByMerchantRule("netflix.com")?.category.id).toBe("subscriptions");
    expect(categorizeByMerchantRule("NETFLIX.COM")?.category.id).toBe("subscriptions");
  });
});

describe("categorizeStatementDescription — bank/credit-card statement keyword layer", () => {
  it("falls back to fee categorization for statement fee wording with no merchant match", () => {
    expect(categorizeStatementDescription("Annual Fee Charge").id).toBe("taxes_fees");
    expect(categorizeStatementDescription("ค่าธรรมเนียมรายปี").id).toBe("taxes_fees");
  });

  it("falls back to debt categorization for interest/finance-charge wording with no merchant match", () => {
    expect(categorizeStatementDescription("Interest Charge").id).toBe("debt");
    expect(categorizeStatementDescription("ดอกเบี้ยค้างชำระ").id).toBe("debt");
  });

  it("prefers a merchant match over generic statement keywords", () => {
    // Contains "fee" as a substring of nothing meaningful here, but has a
    // clear merchant signal that should win.
    expect(categorizeStatementDescription("NETFLIX.COM").id).toBe("subscriptions");
  });

  it("falls back to the canonical 'other' category when nothing matches", () => {
    expect(categorizeStatementDescription("UNKNOWN VENDOR XYZ").id).toBe("other");
    expect(categorizeStatementDescription(undefined).id).toBe("other");
  });
});

describe("resolveExpenseCategoryLabel — document confirm write-path helper", () => {
  it("resolves a merchant-hint match over the fallback id", () => {
    expect(resolveExpenseCategoryLabel("TOPS MARKET", "other")).toBe(getCategoryById("groceries")!.label);
  });

  it("falls back to the caller-supplied default category id when no merchant signal exists", () => {
    expect(resolveExpenseCategoryLabel("Unknown Merchant XYZ", "food")).toBe(getCategoryById("food")!.label);
  });

  it("falls back to 'other' if the caller's default id is itself invalid", () => {
    expect(resolveExpenseCategoryLabel("Unknown Merchant XYZ", "not-a-real-id")).toBe(getCategoryById("other")!.label);
  });

  it("handles a missing merchant gracefully", () => {
    expect(resolveExpenseCategoryLabel(undefined, "food")).toBe(getCategoryById("food")!.label);
    expect(resolveExpenseCategoryLabel(null, "food")).toBe(getCategoryById("food")!.label);
  });
});

describe("resolveExtractedCategory — Part C AI-output enforcement", () => {
  it("uses the AI's categoryId when it is a valid, active catalog id", () => {
    const result = resolveExtractedCategory({ categoryId: "groceries", merchant: "Some Shop", defaultCategoryId: "other" });
    expect(result.category.id).toBe("groceries");
    expect(result.source).toBe("ai");
  });

  it("never trusts an invented/unknown categoryId -- falls through to merchant-hint matching instead", () => {
    const result = resolveExtractedCategory({
      categoryId: "totally-made-up-category",
      merchant: "STARBUCKS THONGLOR",
      defaultCategoryId: "other",
    });
    expect(result.category.id).toBe("food");
    expect(result.source).toBe("rule");
  });

  it("falls through to the description when merchant gives no signal", () => {
    const result = resolveExtractedCategory({
      merchant: "Unknown Merchant XYZ",
      description: "NETFLIX.COM subscription renewal",
      defaultCategoryId: "other",
    });
    expect(result.category.id).toBe("subscriptions");
    expect(result.source).toBe("rule");
  });

  it("falls back to the caller's default category id when nothing else matches", () => {
    const result = resolveExtractedCategory({ merchant: "Unknown Merchant XYZ", defaultCategoryId: "food" });
    expect(result.category.id).toBe("food");
    expect(result.source).toBe("default");
  });

  it("falls back to the safe 'other' category when nothing matches and no default is given a valid id", () => {
    const result = resolveExtractedCategory({ defaultCategoryId: "not-a-real-id" });
    expect(result.category.id).toBe("other");
    expect(result.source).toBe("default");
  });

  it("prioritizes learnedMatch over AI and rules", () => {
    const learnedMatch = {
      categoryLabel: "การเดินทาง",
      supportCount: 3,
      eligibleTransactionCount: 3,
      agreementRatio: 1.0,
      latestOccurredAt: "2026-07-15T12:00:00+07:00",
    };

    const result = resolveExtractedCategory({
      categoryId: "groceries",
      merchant: "STARBUCKS",
      defaultCategoryId: "other",
      learnedMatch,
    });

    expect(result.category.id).toBe("transport");
    expect(result.source).toBe("learned");
    expect(result.learnedMatch).toBe(learnedMatch);
  });
});

describe("resolveExpenseCategoryLabel with learnedMatch parameter", () => {
  it("prioritizes learnedMatch label over rules and fallbacks", () => {
    const learnedMatch = {
      categoryLabel: "ช้อปปิ้ง",
      supportCount: 3,
      eligibleTransactionCount: 3,
      agreementRatio: 1.0,
      latestOccurredAt: "2026-07-15T12:00:00+07:00",
    };
    const label = resolveExpenseCategoryLabel("TOPS MARKET", "other", learnedMatch);
    expect(label).toBe(getCategoryById("shopping")!.label);
  });

  it("falls back to rule matching if learnedMatch is missing", () => {
    const label = resolveExpenseCategoryLabel("TOPS MARKET", "other", null);
    expect(label).toBe(getCategoryById("groceries")!.label);
  });
});
