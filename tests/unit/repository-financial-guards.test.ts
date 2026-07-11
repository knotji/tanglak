import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDebtPayment,
  createDebt,
  createTransaction,
  updateDebt,
  updateTransaction,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import { MONEY_ERROR_NEGATIVE_TH, MONEY_ERROR_POSITIVE_TH } from "@/lib/finance/money-guards";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
  };
});

describe("repository-level financial value guards (last line of defense)", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.users.clear();
  });

  it("createTransaction rejects a negative amount for a normal expense", async () => {
    await expect(
      createTransaction("user-a", {
        type: "expense",
        amountSatang: -1000,
        occurredAt: "2026-07-10T12:00:00+07:00",
        merchant: "A",
      }),
    ).rejects.toThrow(MONEY_ERROR_NEGATIVE_TH);
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("createTransaction rejects a zero-amount debt_payment (Category A: strictly positive)", async () => {
    await expect(
      createTransaction("user-a", {
        type: "debt_payment",
        amountSatang: 0,
        occurredAt: "2026-07-10T12:00:00+07:00",
        merchant: "A",
      }),
    ).rejects.toThrow(MONEY_ERROR_POSITIVE_TH);
  });

  it("createTransaction accepts a zero-amount refund/expense (Category B: nonnegative)", async () => {
    const transaction = await createTransaction("user-a", {
      type: "expense",
      amountSatang: 0,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "A",
    });
    expect(transaction.amountSatang).toBe(0);
  });

  it("updateTransaction validates the final merged state when only the amount changes", async () => {
    const transaction = await createTransaction("user-a", {
      type: "debt_payment",
      amountSatang: 1000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "A",
    });
    await expect(updateTransaction("user-a", transaction.id, { amountSatang: -50 })).rejects.toThrow(
      MONEY_ERROR_POSITIVE_TH,
    );
    // Never partially persisted: the original amount must be unchanged.
    const state = getMockState();
    expect(state.transactions.find((t) => t.id === transaction.id)?.amountSatang).toBe(1000);
  });

  it("updateTransaction validates the final merged state when only the type changes to debt_payment", async () => {
    const transaction = await createTransaction("user-a", {
      type: "expense",
      amountSatang: 0,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "A",
    });
    // Patch only `type`; the existing amount (0) is still on the row and
    // must be re-validated against the new type's stricter severity.
    await expect(updateTransaction("user-a", transaction.id, { type: "debt_payment" })).rejects.toThrow(
      MONEY_ERROR_POSITIVE_TH,
    );
  });

  it("createDebt rejects a negative amountDue", async () => {
    await expect(
      createDebt("user-a", {
        name: "KTC",
        amountDueSatang: -100,
        minimumPaymentSatang: 0,
        dueDate: "2026-07-18",
      }),
    ).rejects.toThrow(MONEY_ERROR_NEGATIVE_TH);
    expect(getMockState().debts).toHaveLength(0);
  });

  it("createDebt rejects a negative minimumPayment", async () => {
    await expect(
      createDebt("user-a", {
        name: "KTC",
        amountDueSatang: 100,
        minimumPaymentSatang: -1,
        dueDate: "2026-07-18",
      }),
    ).rejects.toThrow(MONEY_ERROR_NEGATIVE_TH);
  });

  it("createDebt accepts a zero amountDue (e.g. a fully paid statement)", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 0,
      minimumPaymentSatang: 0,
      dueDate: "2026-07-18",
    });
    expect(debt.amountDueSatang).toBe(0);
  });

  it("updateDebt rejects a negative outstandingBalance patch without touching other fields", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });
    await expect(updateDebt("user-a", debt.id, { outstandingBalanceSatang: -1 })).rejects.toThrow(
      MONEY_ERROR_NEGATIVE_TH,
    );
    const state = getMockState();
    expect(state.debts.find((d) => d.id === debt.id)?.amountDueSatang).toBe(1000);
  });

  it("addDebtPayment rejects a zero or negative payment amount before persisting anything", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });
    await expect(addDebtPayment("user-a", debt.id, 0)).rejects.toThrow(MONEY_ERROR_POSITIVE_TH);
    await expect(addDebtPayment("user-a", debt.id, -500)).rejects.toThrow(MONEY_ERROR_POSITIVE_TH);
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("addDebtPayment accepts a positive payment amount", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });
    const { transaction } = await addDebtPayment("user-a", debt.id, 500);
    expect(transaction.amountSatang).toBe(500);
  });

  it("rejects a transaction whose debtId belongs to a different user", async () => {
    const debtOwnedByB = await createDebt("user-b", {
      name: "Other user's debt",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });

    await expect(
      createTransaction("user-a", {
        type: "expense",
        amountSatang: 100,
        occurredAt: "2026-07-10T12:00:00+07:00",
        merchant: "A",
        debtId: debtOwnedByB.id,
      }),
    ).rejects.toThrow("Debt not found");
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("rejects reassigning an existing transaction's debtId to another user's debt", async () => {
    const ownDebt = await createDebt("user-a", {
      name: "Own debt",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });
    const otherDebt = await createDebt("user-b", {
      name: "Other user's debt",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });
    const { transaction } = await addDebtPayment("user-a", ownDebt.id, 500);

    await expect(updateTransaction("user-a", transaction.id, { debtId: otherDebt.id })).rejects.toThrow(
      "Debt not found",
    );
  });
});
