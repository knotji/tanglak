import { beforeEach, describe, expect, it, vi } from "vitest";
import { rollDebtCycleForward } from "@/lib/finance/date";
import { createDebt, createTransaction, listDebts } from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const USER_ID = "debt-cycle-rollover-user";

describe("rollDebtCycleForward", () => {
  it("returns null when today is still within the current cycle", () => {
    expect(rollDebtCycleForward("2026-06-03", "2026-07-02", "2026-06-26")).toBeNull();
  });

  it("returns null when today is exactly the cycle end date (inclusive)", () => {
    expect(rollDebtCycleForward("2026-06-03", "2026-07-02", "2026-07-02")).toBeNull();
  });

  it("rolls forward exactly one cycle when today is one day past the end date", () => {
    expect(rollDebtCycleForward("2026-06-03", "2026-07-02", "2026-07-03")).toEqual({
      cycleStartDate: "2026-07-03",
      cycleEndDate: "2026-08-02",
    });
  });

  it("rolls forward multiple cycles in one call when far past due", () => {
    // Untouched for 3+ months -- must land directly on the cycle that
    // covers "today" in one call, not require 3 separate calls.
    expect(rollDebtCycleForward("2026-06-03", "2026-07-02", "2026-10-15")).toEqual({
      cycleStartDate: "2026-10-03",
      cycleEndDate: "2026-11-02",
    });
  });

  it("re-evaluates day-of-month clamping fresh each cycle instead of compounding drift", () => {
    // A debt due on the 31st rolling through February (28 days in 2026)
    // must return to the 31st in March -- not stay pinned at 28 forever
    // the way compounding shiftDateKeyByMonths(previous, 1) would.
    const result = rollDebtCycleForward("2026-01-01", "2026-01-31", "2026-03-15");
    expect(result).toEqual({
      cycleStartDate: "2026-03-01",
      cycleEndDate: "2026-03-31",
    });
  });

  it("rejects invalid dates", () => {
    expect(() => rollDebtCycleForward("not-a-date", "2026-07-02", "2026-07-10")).toThrow();
    expect(() => rollDebtCycleForward("2026-06-03", "not-a-date", "2026-07-10")).toThrow();
    expect(() => rollDebtCycleForward("2026-06-03", "2026-07-02", "not-a-date")).toThrow();
  });
});

describe("listDebts: lazily rolls a debt's cycle window forward when read past its end date", () => {
  beforeEach(() => {
    const state = getMockState();
    state.debts = [];
    state.transactions = [];
    state.debtPayments = [];
  });

  it("advances cycleStartDate/cycleEndDate and resets paid-this-cycle when the stored cycle has ended", async () => {
    const debt = await createDebt(USER_ID, {
      name: "SAM",
      amountDueSatang: 5_340_00,
      minimumPaymentSatang: 5_340_00,
      dueDate: "2026-07-02",
    });
    // Derived cycle: 2026-06-03 to 2026-07-02. A payment inside that
    // (now past) cycle must not keep counting once the window rolls.
    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 5_340_00,
      occurredAt: "2026-06-26T06:41:00+07:00",
      debtId: debt.id,
    });

    const [beforeRollover] = await listDebts(USER_ID, false, new Date("2026-07-01T12:00:00+07:00"));
    expect(beforeRollover?.cycleStartDate).toBe("2026-06-03");
    expect(beforeRollover?.cycleEndDate).toBe("2026-07-02");
    expect(beforeRollover?.amountPaidThisCycleSatang).toBe(5_340_00);

    // Read again well past the cycle's end date -- 2026-08-15 falls two
    // months after the original 2026-07-02 end date, so the window rolls
    // straight to 2026-08-03..2026-09-02 in one call.
    const [afterRollover] = await listDebts(USER_ID, false, new Date("2026-08-15T12:00:00+07:00"));
    expect(afterRollover?.cycleStartDate).toBe("2026-08-03");
    expect(afterRollover?.cycleEndDate).toBe("2026-09-02");
    // The old payment (in the rolled-past cycle) no longer counts, and no
    // new payment has been made yet in the new window.
    expect(afterRollover?.amountPaidThisCycleSatang).toBe(0);

    // A payment made inside the new window counts correctly.
    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 2_000_00,
      occurredAt: "2026-08-20T12:00:00+07:00",
      debtId: debt.id,
    });
    const [withNewPayment] = await listDebts(USER_ID, false, new Date("2026-08-15T12:00:00+07:00"));
    expect(withNewPayment?.amountPaidThisCycleSatang).toBe(2_000_00);
  });

  it("does not roll a debt with no explicit cycle window (it keeps using the calendar-month fallback)", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Legacy",
      amountDueSatang: 100_00,
      minimumPaymentSatang: 100_00,
      dueDate: "2026-07-18",
    });
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = undefined;
    stored.cycleEndDate = undefined;

    const [result] = await listDebts(USER_ID, false, new Date("2026-08-15T12:00:00+07:00"));
    expect(result?.cycleStartDate).toBeUndefined();
    expect(result?.cycleEndDate).toBeUndefined();
  });

  it("does not roll a paid-off (closed) debt's cycle window", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Closed",
      amountDueSatang: 100_00,
      minimumPaymentSatang: 100_00,
      dueDate: "2026-07-02",
    });
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.status = "paid_off";

    const [result] = await listDebts(USER_ID, true, new Date("2026-09-01T12:00:00+07:00"));
    expect(result?.cycleStartDate).toBe("2026-06-03");
    expect(result?.cycleEndDate).toBe("2026-07-02");
  });
});
