import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveDebtCycleFromDueDate } from "@/lib/finance/date";
import { addDebtPayment, createDebt } from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const USER_ID = "debt-cycle-derivation-user";

describe("deriveDebtCycleFromDueDate", () => {
  it("derives a one-month window ending on the due date", () => {
    expect(deriveDebtCycleFromDueDate("2026-07-02")).toEqual({
      cycleStartDate: "2026-06-03",
      cycleEndDate: "2026-07-02",
    });
  });

  it("clamps the start date when the previous month is shorter (no overflow into a later month)", () => {
    // 2026-03-31 shifted back a month would naively overflow February
    // (28 days in 2026) into March -- must clamp to 2026-02-28 instead,
    // giving a start date of 2026-03-01, not something in April.
    expect(deriveDebtCycleFromDueDate("2026-03-31")).toEqual({
      cycleStartDate: "2026-03-01",
      cycleEndDate: "2026-03-31",
    });
  });

  it("rolls the year over correctly for a January due date", () => {
    expect(deriveDebtCycleFromDueDate("2026-01-31")).toEqual({
      cycleStartDate: "2026-01-01",
      cycleEndDate: "2026-01-31",
    });
  });

  it("rejects an invalid date", () => {
    expect(() => deriveDebtCycleFromDueDate("not-a-date")).toThrow();
  });
});

describe("createDebt: auto-derives a cycle window from the due date", () => {
  beforeEach(() => {
    const state = getMockState();
    state.debts = [];
    state.transactions = [];
    state.debtPayments = [];
  });

  it("sets cycleStartDate/cycleEndDate from dueDate when the caller supplies neither", async () => {
    const debt = await createDebt(USER_ID, {
      name: "SAM",
      amountDueSatang: 5_340_00,
      minimumPaymentSatang: 5_340_00,
      dueDate: "2026-07-02",
    });
    expect(debt.cycleStartDate).toBe("2026-06-03");
    expect(debt.cycleEndDate).toBe("2026-07-02");
  });

  it("does not override an explicitly supplied cycle window", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Explicit Cycle",
      amountDueSatang: 1_000_00,
      minimumPaymentSatang: 1_000_00,
      dueDate: "2026-07-02",
      cycleStartDate: "2026-06-15",
      cycleEndDate: "2026-07-14",
    });
    expect(debt.cycleStartDate).toBe("2026-06-15");
    expect(debt.cycleEndDate).toBe("2026-07-14");
  });

  it("a payment made before the due date, in the previous calendar month, now counts toward this cycle", async () => {
    // Reproduces the reported bug: a debt due 2026-07-02, paid on
    // 2026-06-26 (before the due date, but in June -- the previous
    // calendar month). Without a derived cycle window, the fallback
    // (current Bangkok calendar month) would exclude this payment.
    const debt = await createDebt(USER_ID, {
      name: "SAM",
      amountDueSatang: 5_340_00,
      minimumPaymentSatang: 5_340_00,
      dueDate: "2026-07-02",
    });

    const { debt: updatedDebt } = await addDebtPayment(USER_ID, debt.id, 5_340_00, "2026-06-26T06:41:00+07:00");
    expect(updatedDebt.amountPaidThisCycleSatang).toBe(5_340_00);
  });
});
