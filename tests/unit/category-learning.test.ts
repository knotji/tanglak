import { describe, expect, it } from "vitest";
import type { Transaction } from "@/types/domain";
import {
  resolveLearnedCategoryForMerchant,
  computeLearnedCategoryConfidence,
} from "@/lib/finance/category-learning";
import { normalizeMerchant } from "@/lib/finance/category-fallback";

// Helper to create simple transactions for testing
function makeTx(fields: Partial<Transaction>): Transaction {
  return {
    id: crypto.randomUUID(),
    userId: "user-123",
    type: "expense",
    status: "confirmed",
    amountSatang: 10000,
    currency: "THB",
    occurredAt: "2026-07-15T12:00:00+07:00",
    source: "manual",
    categorySource: "manual",
    category: "อาหารและเครื่องดื่ม",
    merchant: "Test Merchant",
    ...fields,
  };
}

describe("category-learning helper unit tests", () => {
  describe("Merchant Normalization", () => {
    it("normalizes exact merchant name correctly", () => {
      expect(normalizeMerchant(" Starbucks ")).toBe("starbucks");
      expect(normalizeMerchant("STARBUCKS")).toBe("starbucks");
    });

    it("returns null for empty or blank merchant names in resolver", () => {
      expect(resolveLearnedCategoryForMerchant([], null)).toBeNull();
      expect(resolveLearnedCategoryForMerchant([], undefined)).toBeNull();
      expect(resolveLearnedCategoryForMerchant([], "")).toBeNull();
      expect(resolveLearnedCategoryForMerchant([], "   ")).toBeNull();
    });
  });

  describe("Transaction Eligibility", () => {
    it("only includes confirmed transactions", () => {
      const txs = [
        makeTx({ status: "confirmed", category: "อาหารและเครื่องดื่ม" }),
        makeTx({ status: "draft", category: "ช้อปปิ้ง" }),
        makeTx({ status: "pending" as unknown as "confirmed", category: "ช้อปปิ้ง" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Test Merchant");
      expect(match).not.toBeNull();
      expect(match!.categoryLabel).toBe("อาหารและเครื่องดื่ม");
      expect(match!.eligibleTransactionCount).toBe(1);
    });

    it("only includes manual and user_correction category sources", () => {
      const txs = [
        makeTx({ categorySource: "manual", category: "อาหาร" }),
        makeTx({ categorySource: "user_correction", category: "อาหาร" }),
        makeTx({ categorySource: "ai", category: "เดินทาง" }),
        makeTx({ categorySource: "default", category: "เดินทาง" }),
        makeTx({ categorySource: "learned_rule", category: "เดินทาง" }),
        makeTx({ categorySource: "merchant_rule", category: "เดินทาง" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Test Merchant");
      expect(match).not.toBeNull();
      expect(match!.categoryLabel).toBe("อาหาร");
      expect(match!.eligibleTransactionCount).toBe(2);
    });
  });

  describe("Selection Algorithm & Tie-breaking", () => {
    it("selects the most frequent category", () => {
      const txs = [
        makeTx({ category: "อาหาร", categorySource: "manual" }),
        makeTx({ category: "อาหาร", categorySource: "manual" }),
        makeTx({ category: "ช้อปปิ้ง", categorySource: "manual" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Test Merchant");
      expect(match).not.toBeNull();
      expect(match!.categoryLabel).toBe("อาหาร");
      expect(match!.supportCount).toBe(2);
      expect(match!.eligibleTransactionCount).toBe(3);
      expect(match!.agreementRatio).toBe(2 / 3);
    });

    it("resolves ties by choosing the category with the latest occurredAt timestamp", () => {
      const txs = [
        makeTx({ category: "อาหาร", occurredAt: "2026-07-10T12:00:00+07:00" }),
        makeTx({ category: "ช้อปปิ้ง", occurredAt: "2026-07-12T12:00:00+07:00" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Test Merchant");
      expect(match).not.toBeNull();
      expect(match!.categoryLabel).toBe("ช้อปปิ้ง");
      expect(match!.latestOccurredAt).toBe("2026-07-12T12:00:00+07:00");
    });

    it("resolves ties deterministically using original index if occurredAt is identical", () => {
      const txs = [
        makeTx({ category: "อาหาร", occurredAt: "2026-07-10T12:00:00+07:00" }),
        makeTx({ category: "ช้อปปิ้ง", occurredAt: "2026-07-10T12:00:00+07:00" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Test Merchant");
      expect(match).not.toBeNull();
      // First encountered category is selected (stable order)
      expect(match!.categoryLabel).toBe("อาหาร");
    });

    it("does not mutate the input array", () => {
      const txs = Object.freeze([
        makeTx({ category: "อาหาร" }),
        makeTx({ category: "ช้อปปิ้ง" }),
      ]);
      expect(() => resolveLearnedCategoryForMerchant(txs as unknown as Transaction[], "Test Merchant")).not.toThrow();
    });

    it("ignores blank, missing or whitespace-only categories", () => {
      const txs = [
        makeTx({ category: "" }),
        makeTx({ category: "   " }),
        makeTx({ category: undefined }),
      ];
      expect(resolveLearnedCategoryForMerchant(txs, "Test Merchant")).toBeNull();
    });

    it("groups normalized category labels together", () => {
      const txs = [
        makeTx({ category: "อาหาร" }),
        makeTx({ category: " อาหาร " }),
        makeTx({ category: "อาหารถูกต้อง" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Test Merchant");
      expect(match).not.toBeNull();
      expect(match!.supportCount).toBe(2);
    });

    it("excludes transactions of other merchants", () => {
      const txs = [
        makeTx({ merchant: "Merchant A", category: "อาหาร" }),
        makeTx({ merchant: "Merchant B", category: "ช้อปปิ้ง" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Merchant A");
      expect(match).not.toBeNull();
      expect(match!.categoryLabel).toBe("อาหาร");
      expect(match!.eligibleTransactionCount).toBe(1);
    });
  });

  describe("Confidence Tier Scoring", () => {
    it("returns high confidence for supportCount >= 3 and agreementRatio >= 0.75", () => {
      const match = {
        categoryLabel: "อาหาร",
        supportCount: 3,
        eligibleTransactionCount: 4,
        agreementRatio: 0.75,
        latestOccurredAt: "2026-07-15T12:00:00+07:00",
      };
      expect(computeLearnedCategoryConfidence(match)).toBe("high");
    });

    it("returns medium confidence for supportCount >= 2 and agreementRatio >= 0.5", () => {
      const match1 = {
        categoryLabel: "อาหาร",
        supportCount: 2,
        eligibleTransactionCount: 4,
        agreementRatio: 0.5,
        latestOccurredAt: "2026-07-15T12:00:00+07:00",
      };
      const match2 = {
        categoryLabel: "อาหาร",
        supportCount: 2,
        eligibleTransactionCount: 3,
        agreementRatio: 0.66,
        latestOccurredAt: "2026-07-15T12:00:00+07:00",
      };
      expect(computeLearnedCategoryConfidence(match1)).toBe("medium");
      expect(computeLearnedCategoryConfidence(match2)).toBe("medium");
    });

    it("returns low confidence for all other cases", () => {
      const match1 = {
        categoryLabel: "อาหาร",
        supportCount: 1,
        eligibleTransactionCount: 1,
        agreementRatio: 1.0,
        latestOccurredAt: "2026-07-15T12:00:00+07:00",
      };
      const match2 = {
        categoryLabel: "อาหาร",
        supportCount: 2,
        eligibleTransactionCount: 5,
        agreementRatio: 0.4,
        latestOccurredAt: "2026-07-15T12:00:00+07:00",
      };
      expect(computeLearnedCategoryConfidence(match1)).toBe("low");
      expect(computeLearnedCategoryConfidence(match2)).toBe("low");
    });
  });

  describe("Cross-user and Feedback-loop Isolation", () => {
    it("does not leak history between users", () => {
      // Pure function works with whichever list is supplied.
      // Verification of scope contract:
      const userATxs = [
        makeTx({ userId: "userA", category: "อาหาร", merchant: "Cafe" }),
        makeTx({ userId: "userA", category: "อาหาร", merchant: "Cafe" }),
      ];
      const userBTxs = [
        makeTx({ userId: "userB", category: "ช้อปปิ้ง", merchant: "Cafe" }),
        makeTx({ userId: "userB", category: "ช้อปปิ้ง", merchant: "Cafe" }),
      ];

      const matchA = resolveLearnedCategoryForMerchant(userATxs, "Cafe");
      const matchB = resolveLearnedCategoryForMerchant(userBTxs, "Cafe");

      expect(matchA!.categoryLabel).toBe("อาหาร");
      expect(matchB!.categoryLabel).toBe("ช้อปปิ้ง");
    });

    it("prevents feedback loops by ignoring previous learned_rule results", () => {
      const txs = [
        makeTx({ category: "อาหาร", categorySource: "manual" }),
        makeTx({ category: "เดินทาง", categorySource: "learned_rule" }),
        makeTx({ category: "เดินทาง", categorySource: "learned_rule" }),
        makeTx({ category: "เดินทาง", categorySource: "learned_rule" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Test Merchant");
      expect(match).not.toBeNull();
      // Learned rules are ignored, so "อาหาร" wins from the only manual vote
      expect(match!.categoryLabel).toBe("อาหาร");
      expect(match!.eligibleTransactionCount).toBe(1);
    });

    it("ignores automated system fallbacks and AI sources", () => {
      const txs = [
        makeTx({ category: "อาหาร", categorySource: "user_correction" }),
        makeTx({ category: "เดินทาง", categorySource: "ai" }),
        makeTx({ category: "ช้อปปิ้ง", categorySource: "default" }),
      ];
      const match = resolveLearnedCategoryForMerchant(txs, "Test Merchant");
      expect(match).not.toBeNull();
      expect(match!.categoryLabel).toBe("อาหาร");
      expect(match!.eligibleTransactionCount).toBe(1);
    });
  });
});
