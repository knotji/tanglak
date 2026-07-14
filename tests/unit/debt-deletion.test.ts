import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDebtPayment,
  createDebt,
  createTransaction,
  deleteDebt,
  deleteTransaction,
  listDebts,
  markDebtPaidOff,
  reopenDebt,
  updateTransaction,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const USER_ID = "debt-deletion-user";

function resetState() {
  const state = getMockState();
  state.transactions = [];
  state.debts = [];
}

function debtInput(name = "Card") {
  return {
    name,
    amountDueSatang: 10_000_00,
    minimumPaymentSatang: 1_000_00,
    dueDate: "2026-07-25",
  };
}

function repositorySource() {
  return readFileSync(join(process.cwd(), "src/lib/data/finance-repository.ts"), "utf8");
}

describe("debt soft deletion write safety", () => {
  beforeEach(resetState);

  it("rejects creating a debt_payment for a deleted debt before writing a transaction", async () => {
    const debt = await createDebt(USER_ID, debtInput());
    await deleteDebt(USER_ID, debt.id);
    const before = [...getMockState().transactions];

    await expect(
      createTransaction(USER_ID, {
        type: "debt_payment",
        amountSatang: 500_00,
        occurredAt: "2026-07-10T12:00:00+07:00",
        debtId: debt.id,
      }),
    ).rejects.toThrow("Deleted debt cannot be changed");

    expect(getMockState().transactions).toEqual(before);
  });

  it("rejects updating a transaction to a deleted debt_id before writing", async () => {
    const debt = await createDebt(USER_ID, debtInput());
    await deleteDebt(USER_ID, debt.id);
    const transaction = await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 500_00,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "Lunch",
    });
    const before = getMockState().transactions.map((item) => ({ ...item }));

    await expect(updateTransaction(USER_ID, transaction.id, { type: "debt_payment", debtId: debt.id })).rejects.toThrow(
      "Deleted debt cannot be changed",
    );

    expect(getMockState().transactions).toEqual(before);
  });

  it("rejects editing a preserved deleted-debt payment without a partial write", async () => {
    const debt = await createDebt(USER_ID, debtInput());
    const { transaction } = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00");
    await deleteDebt(USER_ID, debt.id);
    const before = getMockState().transactions.find((item) => item.id === transaction.id);

    await expect(updateTransaction(USER_ID, transaction.id, { amountSatang: 700_00 })).rejects.toThrow(
      "Deleted debt cannot be changed",
    );

    expect(getMockState().transactions.find((item) => item.id === transaction.id)).toEqual(before);
  });

  it("allows deleting a preserved deleted-debt payment without recalculation throwing after the row changes", async () => {
    const debt = await createDebt(USER_ID, debtInput());
    const { transaction } = await addDebtPayment(USER_ID, debt.id, 500_00, "2026-07-10T12:00:00+07:00");
    await deleteDebt(USER_ID, debt.id);

    await expect(deleteTransaction(USER_ID, transaction.id)).resolves.toBeUndefined();

    expect(getMockState().transactions.find((item) => item.id === transaction.id)).toBeUndefined();
    expect(getMockState().debts.find((item) => item.id === debt.id)?.status).toBe("deleted");
  });

  it("allows editing a preserved historical non-payment row that references a deleted debt", async () => {
    const debt = await createDebt(USER_ID, debtInput());
    const transaction = await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 500_00,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "Legacy row",
      debtId: debt.id,
      isHistorical: true,
    });
    await deleteDebt(USER_ID, debt.id);

    await expect(updateTransaction(USER_ID, transaction.id, { merchant: "Edited legacy row" })).resolves.toMatchObject({
      id: transaction.id,
      merchant: "Edited legacy row",
    });

    expect(getMockState().debts.find((item) => item.id === debt.id)?.status).toBe("deleted");
  });

  it("makes deleted debt status terminal", async () => {
    const debt = await createDebt(USER_ID, debtInput());
    await deleteDebt(USER_ID, debt.id);

    await expect(markDebtPaidOff(USER_ID, debt.id)).rejects.toThrow("Deleted debt cannot be changed");
    await expect(reopenDebt(USER_ID, debt.id)).rejects.toThrow("Deleted debt cannot be changed");

    expect(getMockState().debts.find((item) => item.id === debt.id)?.status).toBe("deleted");
  });

  it("preserves normal active to paid_off transition", async () => {
    const debt = await createDebt(USER_ID, debtInput());

    await expect(markDebtPaidOff(USER_ID, debt.id)).resolves.toMatchObject({ status: "paid_off" });
  });

  it("keeps stale close actions from resurrecting a deleted debt", async () => {
    const debt = await createDebt(USER_ID, debtInput());
    await deleteDebt(USER_ID, debt.id);

    await expect(markDebtPaidOff(USER_ID, debt.id)).rejects.toThrow("Deleted debt cannot be changed");
    expect(await listDebts(USER_ID)).toEqual([]);
    expect(await listDebts(USER_ID, true)).toEqual([]);
  });

  it("keeps mock and Supabase paths aligned on deleted-debt guards", () => {
    const source = repositorySource();

    expect(source).toContain("if (debt.status === \"deleted\") throw new Error(DELETED_DEBT_ERROR)");
    expect(source).toContain("if (data.status === \"deleted\") throw new Error(DELETED_DEBT_ERROR)");
    expect(source).toContain(".neq(\"status\", \"deleted\")");
    expect(source).toContain("if (!debt || debt.status === \"deleted\") return");
    expect(source).toContain("if (debt.status === \"deleted\") return");
  });
});
