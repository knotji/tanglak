import { describe, expect, it } from "vitest";
import { categorizeByMerchantRule, categorizeStatementDescription } from "@/lib/finance/category-fallback";

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
