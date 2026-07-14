import { describe, expect, it, beforeEach } from "vitest";
import { generateLikelyDebtPaymentCandidates } from "@/lib/reconciliation/likely-debt-payment";
import { USER_ID, debt, resetReconciliationFixtureIds, tx } from "./fixtures";

describe("generateLikelyDebtPaymentCandidates", () => {
  beforeEach(() => resetReconciliationFixtureIds());

  it("matches a clear lender name and amount", () => {
    const theDebt = debt({ name: "Kasikorn Credit Card", minimumPaymentSatang: 50_000 });
    const expense = tx({ type: "expense", amountSatang: 50_000, merchant: "Payment to Kasikorn Credit Card", occurredAt: "2026-07-20T09:00:00+07:00" });

    const [candidate] = generateLikelyDebtPaymentCandidates(USER_ID, [expense], [theDebt]);

    expect(candidate.candidateType).toBe("likely_debt_payment");
    expect(candidate.relatedDebtIds).toEqual([theDebt.id]);
    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("explicit_debt_destination");
  });

  it("matches an explicit destination even without an amount match", () => {
    const theDebt = debt({ name: "Home Loan", minimumPaymentSatang: 200_000 });
    const expense = tx({ type: "expense", amountSatang: 500_000, note: "จ่าย Home Loan งวดพิเศษ", occurredAt: "2026-07-05T09:00:00+07:00" });

    const [candidate] = generateLikelyDebtPaymentCandidates(USER_ID, [expense], [theDebt]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toContain("explicit_debt_destination");
  });

  it("matches on amount and due-date proximity when the destination is not explicit", () => {
    const theDebt = debt({ name: "Some Bank Card", minimumPaymentSatang: 60_000, dueDate: "2026-07-20" });
    const expense = tx({ type: "expense", amountSatang: 60_000, merchant: "Generic Payment Counter", occurredAt: "2026-07-19T09:00:00+07:00" });

    const [candidate] = generateLikelyDebtPaymentCandidates(USER_ID, [expense], [theDebt]);

    expect(candidate.evidence.map((e) => e.reasonCode)).toEqual(
      expect.arrayContaining(["amount_exact_match", "due_date_proximity"]),
    );
  });

  it("does not generate a candidate for an ambiguous debt name with no amount/due-date support", () => {
    const theDebt = debt({ name: "Bank Loan", minimumPaymentSatang: 60_000, dueDate: "2026-07-20" });
    // Merchant text is generic and amount/due-date don't line up either.
    const expense = tx({ type: "expense", amountSatang: 12_345, merchant: "7-Eleven", occurredAt: "2026-06-01T09:00:00+07:00" });

    expect(generateLikelyDebtPaymentCandidates(USER_ID, [expense], [theDebt])).toHaveLength(0);
  });

  it("flags multiple matching debts as ambiguous and caps confidence low", () => {
    const debtA = debt({ name: "Shared Bank Card A", minimumPaymentSatang: 50_000 });
    const debtB = debt({ name: "Shared Bank Card B", minimumPaymentSatang: 50_000 });
    const expense = tx({ type: "expense", amountSatang: 50_000, merchant: "Shared Bank Card payment", occurredAt: "2026-07-20T09:00:00+07:00" });

    const candidates = generateLikelyDebtPaymentCandidates(USER_ID, [expense], [debtA, debtB]);

    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.confidence).toBe("low");
      expect(candidate.evidence.map((e) => e.reasonCode)).toContain("multiple_debt_matches");
    }
  });

  it("produces no candidates when there is no active debt", () => {
    const expense = tx({ type: "expense", amountSatang: 50_000, merchant: "Payment to Kasikorn Credit Card" });

    expect(generateLikelyDebtPaymentCandidates(USER_ID, [expense], [])).toHaveLength(0);
  });

  it("ignores paid-off/paused debts", () => {
    const paidOff = debt({ name: "Kasikorn Credit Card", minimumPaymentSatang: 50_000, status: "paid_off" });
    const expense = tx({ type: "expense", amountSatang: 50_000, merchant: "Payment to Kasikorn Credit Card" });

    expect(generateLikelyDebtPaymentCandidates(USER_ID, [expense], [paidOff])).toHaveLength(0);
  });

  it("never mutates the debt or transaction objects it reads", () => {
    const theDebt = debt({ name: "Kasikorn Credit Card", minimumPaymentSatang: 50_000 });
    const debtSnapshot = { ...theDebt };
    const expense = tx({ type: "expense", amountSatang: 50_000, merchant: "Payment to Kasikorn Credit Card" });
    const expenseSnapshot = { ...expense };

    generateLikelyDebtPaymentCandidates(USER_ID, [expense], [theDebt]);

    expect(theDebt).toEqual(debtSnapshot);
    expect(expense).toEqual(expenseSnapshot);
  });

  it("does not touch debt-typed transactions already linked to a debt (nothing to reconcile)", () => {
    const theDebt = debt({ name: "Kasikorn Credit Card", minimumPaymentSatang: 50_000 });
    const alreadyLinked = tx({ type: "debt_payment", amountSatang: 50_000, debtId: theDebt.id, merchant: "Kasikorn Credit Card" });

    expect(generateLikelyDebtPaymentCandidates(USER_ID, [alreadyLinked], [theDebt])).toHaveLength(0);
  });
});
