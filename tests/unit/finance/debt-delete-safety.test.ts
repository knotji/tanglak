import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDebtPayment,
  createDebt,
  createTransaction,
  deleteDebt,
  listDebts,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import { buildMonthlyDebtSummary } from "@/lib/finance/debt-summary";
import { createReconciliationCandidate } from "@/lib/reconciliation/reconciliation-candidates-repository";
import type { ReconciliationCandidateDraft } from "@/lib/reconciliation/reconciliation-types";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const USER_ID = "debt-delete-user";
const OTHER_USER_ID = "debt-delete-other";

function resetState() {
  const state = getMockState();
  state.transactions = [];
  state.debts = [];
  state.reconciliationCandidates = [];
}

function draft(userId: string, txId: string, debtId: string): ReconciliationCandidateDraft {
  return {
    userId,
    candidateType: "likely_debt_payment",
    sourceTransactionIds: [txId],
    relatedDebtIds: [debtId],
    evidence: [{ reasonCode: "explicit_debt_destination" }],
    confidence: "medium",
    evidenceSnapshots: [
      {
        type: "debt_payment",
        amountSatang: 500_00,
        occurredAt: "2026-07-10T12:00:00+07:00",
      },
    ],
  };
}

describe("safe debt deletion", () => {
  beforeEach(resetState);

  it("lets a user delete their own debt by archiving it from active lists", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Wrong card",
      amountDueSatang: 10_000_00,
      minimumPaymentSatang: 1_000_00,
      dueDate: "2026-07-25",
    });

    await deleteDebt(USER_ID, debt.id);

    expect(await listDebts(USER_ID)).toEqual([]);
    expect(await listDebts(USER_ID, true)).toEqual([]);
    expect(getMockState().debts.find((item) => item.id === debt.id)?.status).toBe("deleted");
  });

  it("does not let one user delete another user's debt", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Protected card",
      amountDueSatang: 10_000_00,
      minimumPaymentSatang: 1_000_00,
      dueDate: "2026-07-25",
    });

    await expect(deleteDebt(OTHER_USER_ID, debt.id)).rejects.toThrow("Cannot access another user's data");
    expect(getMockState().debts.find((item) => item.id === debt.id)?.status).toBe("active");
  });

  it("updates active debt totals without touching unrelated debts", async () => {
    const removed = await createDebt(USER_ID, {
      name: "Remove me",
      outstandingBalanceSatang: 10_000_00,
      amountDueSatang: 2_000_00,
      minimumPaymentSatang: 1_000_00,
      dueDate: "2026-07-15",
    });
    const survivor = await createDebt(USER_ID, {
      name: "Keep me",
      outstandingBalanceSatang: 5_000_00,
      amountDueSatang: 1_000_00,
      minimumPaymentSatang: 500_00,
      dueDate: "2026-07-20",
    });

    await deleteDebt(USER_ID, removed.id);

    const activeDebts = await listDebts(USER_ID);
    expect(activeDebts.map((debt) => debt.id)).toEqual([survivor.id]);
    expect(buildMonthlyDebtSummary(activeDebts, [], "2026-07").totalOutstandingSatang).toBe(5_000_00);
  });

  it("preserves unrelated transactions and payment transactions with their debt links", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Card",
      amountDueSatang: 10_000_00,
      minimumPaymentSatang: 1_000_00,
      dueDate: "2026-07-25",
    });
    const unrelated = await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 300_00,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "Lunch",
    });
    const { transaction: payment } = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00");

    await deleteDebt(USER_ID, debt.id);

    expect(getMockState().transactions.find((item) => item.id === unrelated.id)).toBeDefined();
    expect(getMockState().transactions.find((item) => item.id === payment.id)?.debtId).toBe(debt.id);
    expect(getMockState().transactions.find((item) => item.id === payment.id)?.type).toBe("debt_payment");
  });

  it("preserves reconciliation candidate history that references the archived debt", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Card",
      amountDueSatang: 10_000_00,
      minimumPaymentSatang: 1_000_00,
      dueDate: "2026-07-25",
    });
    const { transaction } = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00");
    const candidate = await createReconciliationCandidate({
      draft: draft(USER_ID, transaction.id, debt.id),
      policyOutcome: "require_confirmation",
      requiresReview: true,
    });

    await deleteDebt(USER_ID, debt.id);

    expect(getMockState().reconciliationCandidates.find((item) => item.id === candidate.record.id)?.relatedDebtIds).toEqual([debt.id]);
  });

  it("is idempotent when the same debt is deleted more than once", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Wrong card",
      amountDueSatang: 10_000_00,
      minimumPaymentSatang: 1_000_00,
      dueDate: "2026-07-25",
    });

    await deleteDebt(USER_ID, debt.id);
    await expect(deleteDebt(USER_ID, debt.id)).resolves.toBeUndefined();
    expect(getMockState().debts.filter((item) => item.id === debt.id)).toHaveLength(1);
  });
});
