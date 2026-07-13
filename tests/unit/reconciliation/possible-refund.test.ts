import { describe, expect, it, beforeEach } from "vitest";
import { generatePossibleRefundCandidates } from "@/lib/reconciliation/possible-refund";
import { USER_ID, resetReconciliationFixtureIds, tx } from "./fixtures";

describe("generatePossibleRefundCandidates", () => {
  beforeEach(() => resetReconciliationFixtureIds());

  it("flags a likely refund candidate (exact amount, same merchant)", () => {
    const expense = tx({ type: "expense", amountSatang: 100_000, merchant: "Lazada", occurredAt: "2026-07-01T10:00:00+07:00" });
    const refund = tx({ type: "refund", amountSatang: 100_000, merchant: "Lazada", occurredAt: "2026-07-05T10:00:00+07:00" });

    const [candidate] = generatePossibleRefundCandidates(USER_ID, [expense, refund]);

    expect(candidate.candidateType).toBe("possible_refund");
    expect(candidate.evidence.map((e) => e.reasonCode)).toEqual(
      expect.arrayContaining(["merchant_exact_match", "amount_exact_match"]),
    );
  });

  it("treats a partial refund as review-only, never full confidence certainty beyond suggest tier", () => {
    const expense = tx({ type: "expense", amountSatang: 100_000, merchant: "Shopee", occurredAt: "2026-07-01T10:00:00+07:00" });
    const partialRefund = tx({ type: "refund", amountSatang: 40_000, merchant: "Shopee", occurredAt: "2026-07-03T10:00:00+07:00" });

    const [candidate] = generatePossibleRefundCandidates(USER_ID, [expense, partialRefund]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("partial_refund_amount");
    expect(candidate.confidence).not.toBe("high");
  });

  it("does not classify an unrelated incoming transfer as a refund", () => {
    const expense = tx({ type: "expense", amountSatang: 100_000, merchant: "Lazada", occurredAt: "2026-07-01T10:00:00+07:00" });
    const unrelatedIncome = tx({ type: "income", amountSatang: 100_000, merchant: "Friend Transfer", occurredAt: "2026-07-05T10:00:00+07:00" });

    expect(generatePossibleRefundCandidates(USER_ID, [expense, unrelatedIncome])).toHaveLength(0);
  });

  it("rejects when the timing is too far apart", () => {
    const expense = tx({ type: "expense", amountSatang: 100_000, merchant: "Lazada", occurredAt: "2026-01-01T10:00:00+07:00" });
    const refund = tx({ type: "refund", amountSatang: 100_000, merchant: "Lazada", occurredAt: "2026-07-01T10:00:00+07:00" });

    expect(generatePossibleRefundCandidates(USER_ID, [expense, refund], { windowDays: 90 })).toHaveLength(0);
  });

  it("rejects when merchant/reference evidence is missing entirely", () => {
    const expense = tx({ type: "expense", amountSatang: 100_000, occurredAt: "2026-07-01T10:00:00+07:00" });
    const refund = tx({ type: "refund", amountSatang: 100_000, occurredAt: "2026-07-03T10:00:00+07:00" });

    expect(generatePossibleRefundCandidates(USER_ID, [expense, refund])).toHaveLength(0);
  });

  it("flags multiple earlier expenses as ambiguous and caps confidence low", () => {
    const expenseA = tx({ type: "expense", amountSatang: 100_000, merchant: "Lazada", occurredAt: "2026-07-01T10:00:00+07:00" });
    const expenseB = tx({ type: "expense", amountSatang: 100_000, merchant: "Lazada", occurredAt: "2026-07-02T10:00:00+07:00" });
    const refund = tx({ type: "refund", amountSatang: 100_000, merchant: "Lazada", occurredAt: "2026-07-05T10:00:00+07:00" });

    const candidates = generatePossibleRefundCandidates(USER_ID, [expenseA, expenseB, refund]);

    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.confidence).toBe("low");
      expect(candidate.evidence.map((e) => e.reasonCode)).toContain("multiple_earlier_expenses");
    }
  });

  it("never exceeds the original expense amount (a refund larger than the purchase is not a candidate)", () => {
    const expense = tx({ type: "expense", amountSatang: 50_000, merchant: "Lazada", occurredAt: "2026-07-01T10:00:00+07:00" });
    const tooLarge = tx({ type: "refund", amountSatang: 90_000, merchant: "Lazada", occurredAt: "2026-07-03T10:00:00+07:00" });

    expect(generatePossibleRefundCandidates(USER_ID, [expense, tooLarge])).toHaveLength(0);
  });
});
