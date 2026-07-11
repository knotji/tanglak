import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockState } from "@/lib/data/mock-store";
import {
  MONEY_ERROR_INVALID_TH,
  MONEY_ERROR_NEGATIVE_TH,
  MONEY_ERROR_POSITIVE_TH,
} from "@/lib/finance/money-guards";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
    requireUser: vi.fn(async () => ({ id: "user-a", email: "user-a@example.test" })),
  };
});

import { requireUser } from "@/lib/auth/session";
import {
  addDebtPaymentAction,
  deleteDebtPaymentAction,
  deleteTransactionAction,
  saveDebtAction,
  saveTransactionAction,
  updateDebtPaymentAction,
} from "@/app/actions/finance";
import { addDebtPayment, createDebt, createTransaction } from "@/lib/data/finance-repository";

function fd(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("finance server actions — financial value guards", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.users.clear();
    vi.mocked(requireUser).mockResolvedValue({ id: "user-a", email: "user-a@example.test" });
  });

  it("saveDebtAction rejects a negative amountDue without creating a debt", async () => {
    const result = await saveDebtAction(
      { ok: false },
      fd({ name: "KTC", amount: "-500", dueDate: "2026-07-18" }),
    );
    expect(result).toEqual({ ok: false, message: MONEY_ERROR_NEGATIVE_TH });
    expect(getMockState().debts).toHaveLength(0);
  });

  it("saveDebtAction rejects a negative minimumPayment", async () => {
    const result = await saveDebtAction(
      { ok: false },
      fd({ name: "KTC", amount: "500", minimum: "-1", dueDate: "2026-07-18" }),
    );
    expect(result).toEqual({ ok: false, message: MONEY_ERROR_NEGATIVE_TH });
  });

  it("saveDebtAction returns a clean Thai error for a malformed amount instead of throwing", async () => {
    const result = await saveDebtAction(
      { ok: false },
      fd({ name: "KTC", amount: "not-a-number", dueDate: "2026-07-18" }),
    );
    expect(result).toEqual({ ok: false, message: MONEY_ERROR_INVALID_TH });
  });

  it("saveDebtAction accepts a valid positive amount", async () => {
    const result = await saveDebtAction(
      { ok: false },
      fd({ name: "KTC", amount: "1500.50", dueDate: "2026-07-18" }),
    );
    expect(result.ok).toBe(true);
    expect(getMockState().debts).toHaveLength(1);
    expect(getMockState().debts[0]?.amountDueSatang).toBe(150_050);
  });

  it("saveDebtAction update rejects a negative value and leaves the existing debt untouched", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });

    const result = await saveDebtAction(
      { ok: false },
      fd({ id: debt.id, name: "KTC", amount: "-1000", dueDate: "2026-07-18" }),
    );
    expect(result).toEqual({ ok: false, message: MONEY_ERROR_NEGATIVE_TH });
    expect(getMockState().debts.find((d) => d.id === debt.id)?.amountDueSatang).toBe(1000);
  });

  it("saveTransactionAction rejects a negative expense amount", async () => {
    const result = await saveTransactionAction(
      { ok: false },
      fd({ type: "expense", amount: "-189", label: "GrabFood", date: "2026-07-10" }),
    );
    expect(result).toEqual({ ok: false, message: MONEY_ERROR_NEGATIVE_TH });
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("saveTransactionAction accepts a zero-amount expense (Category B) but rejects a zero debt_payment (Category A)", async () => {
    const zeroExpense = await saveTransactionAction(
      { ok: false },
      fd({ type: "expense", amount: "0", label: "Free sample", date: "2026-07-10" }),
    );
    expect(zeroExpense.ok).toBe(true);

    const zeroPayment = await saveTransactionAction(
      { ok: false },
      fd({ type: "debt_payment", amount: "0", label: "ชำระหนี้", date: "2026-07-10" }),
    );
    expect(zeroPayment).toEqual({ ok: false, message: MONEY_ERROR_POSITIVE_TH });
  });

  it("addDebtPaymentAction rejects a zero or negative payment amount", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });

    const zero = await addDebtPaymentAction({ ok: false }, fd({ debtId: debt.id, amount: "0" }));
    expect(zero).toEqual({ ok: false, message: MONEY_ERROR_POSITIVE_TH });

    const negative = await addDebtPaymentAction({ ok: false }, fd({ debtId: debt.id, amount: "-500" }));
    expect(negative).toEqual({ ok: false, message: MONEY_ERROR_POSITIVE_TH });

    expect(getMockState().transactions).toHaveLength(0);
  });

  it("addDebtPaymentAction accepts a positive comma-formatted amount", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });
    const result = await addDebtPaymentAction({ ok: false }, fd({ debtId: debt.id, amount: "1,500.00" }));
    expect(result.ok).toBe(true);
    expect(getMockState().transactions[0]?.amountSatang).toBe(150_000);
  });

  it("updateDebtPaymentAction rejects a negative payment amount", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });
    const { transaction } = await addDebtPayment("user-a", debt.id, 500);

    const result = await updateDebtPaymentAction(
      { ok: false },
      fd({ id: transaction.id, debtId: debt.id, amount: "-100", date: "2026-07-11" }),
    );
    expect(result).toEqual({ ok: false, message: MONEY_ERROR_POSITIVE_TH });
  });

  it("unauthorized user cannot update another user's debt via saveDebtAction", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });

    vi.mocked(requireUser).mockResolvedValue({ id: "user-b", email: "user-b@example.test" });
    const result = await saveDebtAction(
      { ok: false },
      fd({ id: debt.id, name: "Hijacked", amount: "1", dueDate: "2026-07-18" }),
    );
    expect(result.ok).toBe(false);
    expect(getMockState().debts.find((d) => d.id === debt.id)?.name).toBe("KTC");
  });

  it("unauthorized user cannot delete another user's transaction", async () => {
    const transaction = await createTransaction("user-a", {
      type: "expense",
      amountSatang: 1000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "A",
    });

    vi.mocked(requireUser).mockResolvedValue({ id: "user-b", email: "user-b@example.test" });
    const result = await deleteTransactionAction(transaction.id);
    expect(result.ok).toBe(false);
    expect(getMockState().transactions.find((t) => t.id === transaction.id)).toBeDefined();
  });

  it("unauthorized user cannot delete another user's debt payment", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 1000,
      minimumPaymentSatang: 500,
      dueDate: "2026-07-18",
    });
    const { transaction } = await addDebtPayment("user-a", debt.id, 500);

    vi.mocked(requireUser).mockResolvedValue({ id: "user-b", email: "user-b@example.test" });
    const result = await deleteDebtPaymentAction(transaction.id, debt.id);
    expect(result.ok).toBe(false);
    expect(getMockState().transactions.find((t) => t.id === transaction.id)).toBeDefined();
  });
});
