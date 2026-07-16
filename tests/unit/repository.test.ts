import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteAccount,
  getAccountDeleteSafety,
  listAccounts,
  saveAccount,
  setDefaultAccount,
} from "@/lib/data/account-repository";
import {
  addDebtPayment,
  createDebt,
  createTransaction,
  deleteTransaction,
  listDebts,
  listTransactions,
  markDebtPaidOff,
  recalculateDebtPaidThisCycle,
  reopenDebt,
  updateTransaction,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import { DEBT_ERROR_UNLINKED_PAYMENT_TH } from "@/lib/finance/debt-guards";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
  };
});

describe("mocked Supabase repository isolation and debt recalculation", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.users.clear();
  });

  it("lists only the current user's transactions", async () => {
    await createTransaction("user-a", {
      type: "expense",
      amountSatang: 1000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "A",
    });
    await createTransaction("user-b", {
      type: "expense",
      amountSatang: 2000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "B",
    });

    const rows = await listTransactions("user-a", "2026-07");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.merchant).toBe("A");
  });

  it("prevents one user from editing another user's transaction", async () => {
    const transaction = await createTransaction("user-a", {
      type: "expense",
      amountSatang: 1000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "A",
    });

    await expect(updateTransaction("user-b", transaction.id, { merchant: "B" })).rejects.toThrow(
      "another user's data",
    );
  });

  it("keeps debt payments separate and recalculates after edit", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 320000,
      minimumPaymentSatang: 320000,
      dueDate: "2026-07-18",
    });
    const { transaction } = await addDebtPayment("user-a", debt.id, 150000);
    await updateTransaction("user-a", transaction.id, { amountSatang: 200000 });

    const [updatedDebt] = await listDebts("user-a");
    expect(updatedDebt?.amountPaidThisCycleSatang).toBe(200000);
  });

  it("recalculates debt progress after deleting a payment transaction", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 320000,
      minimumPaymentSatang: 320000,
      dueDate: "2026-07-18",
    });
    const { transaction } = await addDebtPayment("user-a", debt.id, 150000);
    await deleteTransaction("user-a", transaction.id);

    const [updatedDebt] = await listDebts("user-a");
    expect(updatedDebt?.amountPaidThisCycleSatang).toBe(0);
  });

  it("scopes paid-this-cycle to the debt's active cycle window", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 320000,
      minimumPaymentSatang: 100000,
      dueDate: "2026-07-18",
      cycleStartDate: "2026-07-01",
      cycleEndDate: "2026-07-31",
    });
    await createTransaction("user-a", {
      type: "debt_payment",
      amountSatang: 90000,
      occurredAt: "2026-06-30T23:59:59+07:00",
      debtId: debt.id,
    });
    await createTransaction("user-a", {
      type: "debt_payment",
      amountSatang: 125000,
      occurredAt: "2026-07-15T12:00:00+07:00",
      debtId: debt.id,
    });
    await createTransaction("user-a", {
      type: "debt_payment",
      amountSatang: 75000,
      occurredAt: "2026-08-01T00:00:00+07:00",
      debtId: debt.id,
    });

    const [updatedDebt] = await listDebts("user-a");
    expect(updatedDebt?.amountPaidThisCycleSatang).toBe(125000);
  });

  it("falls back to the current Bangkok month when a debt has no explicit cycle", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 320000,
      minimumPaymentSatang: 100000,
      dueDate: "2026-07-18",
    });
    // createDebt now derives a cycle window from dueDate when the caller
    // doesn't supply one explicitly (see debt-cycle-derivation.test.ts), so
    // simulate a legacy debt predating that feature -- one whose cycle
    // fields are still null -- by clearing them directly in the mock store.
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = undefined;
    stored.cycleEndDate = undefined;
    await createTransaction("user-a", {
      type: "debt_payment",
      amountSatang: 90000,
      occurredAt: "2026-07-31T23:00:00+07:00",
      debtId: debt.id,
    });
    await createTransaction("user-a", {
      type: "debt_payment",
      amountSatang: 125000,
      occurredAt: "2026-08-01T00:00:00+07:00",
      debtId: debt.id,
    });

    await recalculateDebtPaidThisCycle("user-a", debt.id, new Date("2026-07-12T12:00:00+07:00"));
    const [updatedDebt] = await listDebts("user-a");
    expect(updatedDebt?.amountPaidThisCycleSatang).toBe(90000);
  });

  it("rejects an unlinked debt_payment transaction outright (F-003) -- it can never exist to count toward any debt", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 320000,
      minimumPaymentSatang: 100000,
      dueDate: "2026-07-18",
      cycleStartDate: "2026-07-01",
      cycleEndDate: "2026-07-31",
    });
    await expect(
      createTransaction("user-a", {
        type: "debt_payment",
        amountSatang: 125000,
        occurredAt: "2026-07-15T12:00:00+07:00",
      }),
    ).rejects.toThrow(DEBT_ERROR_UNLINKED_PAYMENT_TH);

    await recalculateDebtPaidThisCycle("user-a", debt.id, new Date("2026-07-12T12:00:00+07:00"));
    const [updatedDebt] = await listDebts("user-a");
    expect(updatedDebt?.amountPaidThisCycleSatang).toBe(0);
  });

  it("persists reviewed debt statement fields", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC Platinum",
      creditor: "KTC",
      debtType: "credit_card",
      outstandingBalanceSatang: 410000,
      statementBalanceSatang: 395000,
      amountDueSatang: 120000,
      minimumPaymentSatang: 50000,
      dueDate: "2026-07-18",
      interestRateAnnual: 16.5,
      remainingInstallments: 3,
      creditLimitSatang: 5000000,
    });

    expect(debt.debtType).toBe("credit_card");
    expect(debt.statementBalanceSatang).toBe(395000);
    expect(debt.interestRateAnnual).toBe(16.5);
    expect(debt.remainingInstallments).toBe(3);
    expect(debt.creditLimitSatang).toBe(5000000);
  });

  it("marks paid off and reopens without deleting payment history", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 320000,
      minimumPaymentSatang: 320000,
      dueDate: "2026-07-18",
    });
    await addDebtPayment("user-a", debt.id, 150000);
    await markDebtPaidOff("user-a", debt.id);
    await reopenDebt("user-a", debt.id);

    const [updatedDebt] = await listDebts("user-a", true);
    const transactions = await listTransactions("user-a", new Date().toISOString().slice(0, 7));
    expect(updatedDebt?.status).toBe("active");
    expect(updatedDebt?.amountPaidThisCycleSatang).toBe(150000);
    expect(transactions[0]?.type).toBe("debt_payment");
  });

  it("keeps one active default account per user", async () => {
    const first = await saveAccount("user-a", {
      name: "Main",
      accountType: "bank_account",
      currency: "THB",
      isOwnedByUser: true,
      isDefault: true,
    });
    const second = await saveAccount("user-a", {
      name: "Cash",
      accountType: "cash",
      currency: "THB",
      isOwnedByUser: true,
      isDefault: true,
    });
    await setDefaultAccount("user-a", first.id);

    const accounts = await listAccounts("user-a");
    expect(accounts.filter((account) => account.isDefault)).toHaveLength(1);
    expect(accounts.find((account) => account.id === first.id)?.isDefault).toBe(true);
    expect(accounts.find((account) => account.id === second.id)?.isDefault).toBe(false);
  });

  it("blocks deleting an account linked to confirmed transactions", async () => {
    const account = await saveAccount("user-a", {
      name: "Main",
      accountType: "bank_account",
      currency: "THB",
      isOwnedByUser: true,
      isDefault: true,
    });
    await createTransaction("user-a", {
      type: "expense",
      amountSatang: 1000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "A",
      sourceAccountId: account.id,
    });

    const safety = await getAccountDeleteSafety("user-a", account.id);
    expect(safety.safe).toBe(false);
    await expect(deleteAccount("user-a", account.id)).rejects.toThrow("ผูกอยู่");
  });
});
