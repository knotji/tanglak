import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDebtPayment, createDebt } from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import { DEBT_ERROR_NOT_ACTIVE_TH, DEBT_ERROR_NOT_FOUND_TH } from "@/lib/finance/debt-guards";
import { MONEY_ERROR_POSITIVE_TH } from "@/lib/finance/money-guards";
import type { Debt } from "@/types/domain";

const USER_ID = "debt-payment-atomicity-user";
const OTHER_USER_ID = "debt-payment-atomicity-other-user";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

function resetState() {
  const state = getMockState();
  state.transactions = [];
  state.debts = [];
  state.debtPayments = [];
}

function debtInput(overrides: Partial<Parameters<typeof createDebt>[1]> = {}) {
  return {
    name: "Card",
    amountDueSatang: 10_000_00,
    minimumPaymentSatang: 1_000_00,
    outstandingBalanceSatang: 10_000_00,
    dueDate: "2026-07-25",
    ...overrides,
  };
}

async function seedDebt(overrides: Partial<Parameters<typeof createDebt>[1]> = {}): Promise<Debt> {
  return createDebt(USER_ID, debtInput(overrides));
}

function setDebtStatus(debtId: string, status: Debt["status"]) {
  const debt = getMockState().debts.find((item) => item.id === debtId);
  if (!debt) throw new Error("test setup: debt not found");
  debt.status = status;
}

describe("addDebtPayment: server-side active-only enforcement", () => {
  beforeEach(resetState);

  it("accepts a payment against an active debt", async () => {
    const debt = await seedDebt();
    const { transaction, debt: updatedDebt } = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00");
    expect(transaction.type).toBe("debt_payment");
    expect(transaction.debtId).toBe(debt.id);
    expect(updatedDebt.amountPaidThisCycleSatang).toBe(500_00);
  });

  it.each([
    ["paid_off" as const],
    ["paused" as const],
  ])("rejects a payment against a %s debt without writing anything", async (status) => {
    const debt = await seedDebt();
    setDebtStatus(debt.id, status);
    const before = [...getMockState().transactions];

    await expect(addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00")).rejects.toThrow(
      DEBT_ERROR_NOT_ACTIVE_TH,
    );
    expect(getMockState().transactions).toEqual(before);
  });

  it("accepts a payment against an overdue debt (still open, just past due date)", async () => {
    const debt = await seedDebt();
    setDebtStatus(debt.id, "overdue");

    const { transaction, debt: updatedDebt } = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00");
    expect(transaction.type).toBe("debt_payment");
    expect(updatedDebt.amountPaidThisCycleSatang).toBe(500_00);
  });

  it("rejects a payment against a deleted debt without writing anything", async () => {
    const debt = await seedDebt();
    setDebtStatus(debt.id, "deleted");
    const before = [...getMockState().transactions];

    await expect(addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00")).rejects.toThrow(
      "Deleted debt cannot be changed",
    );
    expect(getMockState().transactions).toEqual(before);
  });

  it("rejects a payment against another user's debt", async () => {
    const debt = await seedDebt();
    await expect(addDebtPayment(OTHER_USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00")).rejects.toThrow(
      DEBT_ERROR_NOT_FOUND_TH,
    );
  });

  it("rejects a zero or negative payment amount before checking debt status", async () => {
    const debt = await seedDebt();
    await expect(addDebtPayment(USER_ID, debt.id, 0)).rejects.toThrow(MONEY_ERROR_POSITIVE_TH);
    await expect(addDebtPayment(USER_ID, debt.id, -100)).rejects.toThrow(MONEY_ERROR_POSITIVE_TH);
  });
});

describe("addDebtPayment: financial invariants preserved", () => {
  beforeEach(resetState);

  it("never reduces outstanding_balance_satang", async () => {
    const debt = await seedDebt({ outstandingBalanceSatang: 5_000_00 });
    await addDebtPayment(USER_ID, debt.id, 1_000_00, "2026-07-10T12:00:00+07:00");
    const updated = getMockState().debts.find((item) => item.id === debt.id);
    expect(updated?.outstandingBalanceSatang).toBe(5_000_00);
  });

  it("always writes a debt_id on the created transaction", async () => {
    const debt = await seedDebt();
    const { transaction } = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00");
    expect(transaction.debtId).toBe(debt.id);
  });

  it("persists the exact caller-supplied occurredAt, never a fabricated fallback", async () => {
    const debt = await seedDebt();
    const explicitInstant = "2026-06-01T03:15:00+07:00";
    const { transaction } = await addDebtPayment(USER_ID, debt.id, 500_00, explicitInstant);
    expect(transaction.occurredAt).toBe(explicitInstant);
  });

  it("current-cycle total excludes payments outside the cycle window", async () => {
    const debt = await seedDebt({ cycleStartDate: "2026-07-01", cycleEndDate: "2026-07-31" });
    await addDebtPayment(USER_ID, debt.id, 300_00, "2026-06-15T12:00:00+07:00");
    const updated = getMockState().debts.find((item) => item.id === debt.id);
    expect(updated?.amountPaidThisCycleSatang).toBe(0);

    await addDebtPayment(USER_ID, debt.id, 400_00, "2026-07-15T12:00:00+07:00");
    const updatedAgain = getMockState().debts.find((item) => item.id === debt.id);
    expect(updatedAgain?.amountPaidThisCycleSatang).toBe(400_00);
  });
});

describe("addDebtPayment: idempotent replay", () => {
  beforeEach(resetState);

  it("returns the original payment instead of duplicating it on a retried call with the same key", async () => {
    const debt = await seedDebt();
    const key = "test-idempotency-key-1";

    const first = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00", { idempotencyKey: key });
    const second = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00", { idempotencyKey: key });

    expect(second.transaction.id).toBe(first.transaction.id);
    expect(getMockState().transactions.filter((item) => item.debtId === debt.id)).toHaveLength(1);

    const updated = getMockState().debts.find((item) => item.id === debt.id);
    expect(updated?.amountPaidThisCycleSatang).toBe(500_00);
  });

  it("treats a different idempotency key as a distinct payment", async () => {
    const debt = await seedDebt();
    await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00", { idempotencyKey: "key-a" });
    await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-11T12:00:00+07:00", { idempotencyKey: "key-b" });

    expect(getMockState().transactions.filter((item) => item.debtId === debt.id)).toHaveLength(2);
    const updated = getMockState().debts.find((item) => item.id === debt.id);
    expect(updated?.amountPaidThisCycleSatang).toBe(1_000_00);
  });
});

describe("addDebtPayment: all-or-nothing on a mid-operation failure", () => {
  beforeEach(resetState);

  it("rolls back the created transaction and debt_payment record if cycle recalculation fails", async () => {
    const debt = await seedDebt();
    // Force the cycle-window computation inside the payment write to throw
    // by corrupting the debt's cycle dates directly in the mock store
    // (bypassing createDebt/updateDebt's own validation, which would never
    // allow this state) -- this simulates an unexpected failure partway
    // through the operation, the same class of failure the atomic Postgres
    // RPC is designed to survive without a partial write.
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = "2026-07-31";
    stored.cycleEndDate = "2026-07-01";

    const transactionsBefore = [...getMockState().transactions];
    const paidThisCycleBefore = stored.amountPaidThisCycleSatang;

    await expect(addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00")).rejects.toThrow();

    expect(getMockState().transactions).toEqual(transactionsBefore);
    expect(getMockState().debtPayments).toHaveLength(0);
    expect(getMockState().debts.find((item) => item.id === debt.id)?.amountPaidThisCycleSatang).toBe(
      paidThisCycleBefore,
    );
  });
});
