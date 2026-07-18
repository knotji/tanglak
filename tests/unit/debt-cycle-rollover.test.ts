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
      monthsElapsed: 1,
    });
  });

  it("rolls forward multiple cycles in one call when far past due", () => {
    // Untouched for 3+ months -- must land directly on the cycle that
    // covers "today" in one call, not require 3 separate calls.
    expect(rollDebtCycleForward("2026-06-03", "2026-07-02", "2026-10-15")).toEqual({
      cycleStartDate: "2026-10-03",
      cycleEndDate: "2026-11-02",
      monthsElapsed: 4,
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
      monthsElapsed: 2,
    });
  });

  it("rejects invalid dates", () => {
    expect(() => rollDebtCycleForward("not-a-date", "2026-07-02", "2026-07-10")).toThrow();
    expect(() => rollDebtCycleForward("2026-06-03", "not-a-date", "2026-07-10")).toThrow();
    expect(() => rollDebtCycleForward("2026-06-03", "2026-07-02", "not-a-date")).toThrow();
  });

  it("never lets the new cycle's start land on or before the previous cycle's end, even across a clamped month-end due date", () => {
    // deriveDebtCycleFromDueDate("2026-04-30") produces exactly this window
    // (2026-03-31..2026-04-30) -- independently month-shifting the original
    // start date (2026-03-31 -> clamped to 2026-04-30, since April has only
    // 30 days) would collide with the new end date (also 2026-04-30),
    // double-counting a payment made on that boundary day in both cycles.
    const result = rollDebtCycleForward("2026-03-31", "2026-04-30", "2026-05-15");
    expect(result).toEqual({
      cycleStartDate: "2026-05-01",
      cycleEndDate: "2026-05-30",
      monthsElapsed: 1,
    });
    // The new cycle must start strictly after the old cycle's end.
    expect(result!.cycleStartDate > "2026-04-30").toBe(true);
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
    expect(beforeRollover?.dueDate).toBe("2026-07-02");
    expect(beforeRollover?.amountPaidThisCycleSatang).toBe(5_340_00);

    // Read again well past the cycle's end date -- 2026-08-15 falls two
    // months after the original 2026-07-02 end date, so the window rolls
    // straight to 2026-08-03..2026-09-02 in one call.
    const [afterRollover] = await listDebts(USER_ID, false, new Date("2026-08-15T12:00:00+07:00"));
    expect(afterRollover?.cycleStartDate).toBe("2026-08-03");
    expect(afterRollover?.cycleEndDate).toBe("2026-09-02");
    // due_date must advance in lockstep with cycle_end_date -- otherwise the
    // debt would keep showing the old, already-paid 2026-07-02 due date (and
    // an incorrect "overdue" status computed from it) even though the June
    // payment fully covered that cycle on time.
    expect(afterRollover?.dueDate).toBe("2026-09-02");
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

  it("backfills and rolls a debt whose cycle window was never set (e.g. created before per-cycle tracking existed), as long as it has a due date and that elapsed cycle was paid", async () => {
    // "Rabbit Cash" / "SAM" reproduction: a debt that predates cycle-window
    // tracking has NULL cycle_start_date/cycle_end_date in the database.
    // Before this fix, such a debt could never roll at all -- it fell back
    // to the calendar-month window forever, with a due_date that could
    // never advance, so it could show "overdue" indefinitely even once
    // paid. It must instead be backfilled with a derived window (the same
    // derivation createDebt uses for a brand-new debt) and rolled forward
    // like any other tracked debt -- but only once that derived (baseline)
    // cycle is confirmed paid; see the next test for the unpaid case.
    const debt = await createDebt(USER_ID, {
      name: "Legacy",
      amountDueSatang: 100_00,
      minimumPaymentSatang: 100_00,
      dueDate: "2026-07-18",
    });
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = undefined;
    stored.cycleEndDate = undefined;
    // Paid in full within the derived baseline cycle (2026-06-19..2026-07-18).
    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 100_00,
      occurredAt: "2026-07-10T12:00:00+07:00",
      debtId: debt.id,
    });

    // Baseline satisfied -> rolls forward one month to cover 2026-08-15,
    // and due_date advances alongside it.
    const [result] = await listDebts(USER_ID, false, new Date("2026-08-15T12:00:00+07:00"));
    expect(result?.cycleStartDate).toBe("2026-07-19");
    expect(result?.cycleEndDate).toBe("2026-08-18");
    expect(result?.dueDate).toBe("2026-08-18");
  });

  it("does not roll a legacy debt's due date/cycle away from overdue when the elapsed baseline cycle was never paid", async () => {
    // A debt that missed its bill must keep showing "overdue" against the
    // real due date it missed -- rolling it forward to a fresh, not-yet-due
    // cycle just because someone opened the debts page would silently hide
    // a genuinely missed payment, which is the opposite of what a personal
    // finance app is for.
    const debt = await createDebt(USER_ID, {
      name: "Unpaid Legacy",
      amountDueSatang: 100_00,
      minimumPaymentSatang: 100_00,
      dueDate: "2026-07-18",
    });
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = undefined;
    stored.cycleEndDate = undefined;

    const [result] = await listDebts(USER_ID, false, new Date("2026-08-15T12:00:00+07:00"));
    expect(result?.dueDate).toBe("2026-07-18");
    expect(result?.cycleStartDate).toBeUndefined();
    expect(result?.cycleEndDate).toBeUndefined();
    expect(result?.amountPaidThisCycleSatang).toBe(0);
  });

  it("reproduces the exact reported bug (SAM): re-derives from the current due date when a *stored* cycle window has drifted out of sync with it", async () => {
    // SAM: due date is now 2026-07-02, but its stored cycle window is a
    // stale one left over from before the due date was last edited under
    // pre-PR-#51 code (which never re-derived the cycle window on a
    // due-date change) -- 2026-05-03..2026-06-02, one whole month earlier
    // than what the current due date implies. Paid ฿5,340 (the full amount
    // due) on 2026-06-26 -- which falls inside the *correct* cycle
    // (2026-06-03..2026-07-02) but not the stale stored one. Without
    // detecting the desync, checking baseline satisfaction against the
    // stale window finds no payment there and refuses to roll forever,
    // reproducing "still shows overdue with ฿0 paid" for a debt that HAS a
    // stored cycle window (unlike the fully-legacy no-window case above).
    const debt = await createDebt(USER_ID, {
      name: "SAM",
      amountDueSatang: 5_340_00,
      minimumPaymentSatang: 5_340_00,
      dueDate: "2026-07-02",
    });
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = "2026-05-03";
    stored.cycleEndDate = "2026-06-02";
    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 5_340_00,
      occurredAt: "2026-06-26T06:41:00+07:00",
      debtId: debt.id,
    });

    const [result] = await listDebts(USER_ID, false, new Date("2026-07-18T12:00:00+07:00"));
    expect(result?.dueDate).toBe("2026-08-02");
    expect(result?.cycleStartDate).toBe("2026-07-03");
    expect(result?.cycleEndDate).toBe("2026-08-02");
    expect(result?.amountPaidThisCycleSatang).toBe(0);
  });

  it("does not treat an intentionally custom cycle window as stale when it merely extends past the due date", async () => {
    // updateDebt explicitly supports (and tests) a caller-supplied cycle
    // window that legitimately differs from due_date -- e.g. a window that
    // extends past the due date on purpose. The stale-window detection
    // above must only fire when the stored window has fallen *behind* the
    // due date (cycle_end_date < due_date, the "due date moved forward,
    // window frozen in the past" signature), never merely because the two
    // differ -- otherwise it would silently discard a deliberately-set
    // window like this one.
    const debt = await createDebt(USER_ID, {
      name: "KTC",
      amountDueSatang: 100_000_00,
      minimumPaymentSatang: 50_000_00,
      dueDate: "2026-07-18",
      cycleStartDate: "2026-07-01",
      cycleEndDate: "2026-07-31",
    });
    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 50_000_00,
      occurredAt: "2026-07-10T12:00:00+07:00",
      debtId: debt.id,
    });

    // Read well past the custom window's own end date (2026-07-31) --
    // enough to force an actual roll decision, unlike a same-day read that
    // would just return null (no roll due) regardless of this fix.
    const [result] = await listDebts(USER_ID, false, new Date("2026-09-15T12:00:00+07:00"));
    // The custom window rolls forward from its own bounds (2026-07-01..
    // 2026-07-31), not from a due-date-only derivation that would have
    // discarded the wider, intentionally-set span.
    expect(result?.cycleStartDate).toBe("2026-08-31");
    expect(result?.cycleEndDate).toBe("2026-09-30");
  });

  it("re-derives when the due date moved earlier than the stored window too, not just later", async () => {
    // Codex follow-up finding on the fix above: a stored window can drift
    // out of sync in either direction, not just "due date moved forward
    // past a frozen window" (SAM's case). Here the due date was edited
    // *backward* to 2026-07-18 under old code, leaving the stale window
    // at 2026-07-19..2026-08-18 -- which doesn't even contain the due date
    // (it starts the day after). Checking "cycle_end_date >= due_date"
    // alone would wrongly call this window "in sync" (08-18 >= 07-18);
    // only checking that the due date actually falls *within* the stored
    // window catches this direction of drift too.
    const debt = await createDebt(USER_ID, {
      name: "Drifted Earlier",
      amountDueSatang: 2_000_00,
      minimumPaymentSatang: 2_000_00,
      dueDate: "2026-07-18",
    });
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = "2026-07-19";
    stored.cycleEndDate = "2026-08-18";
    // Paid before the due date -- within the *correct* window
    // (2026-06-19..2026-07-18) but outside the stale stored one.
    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 2_000_00,
      occurredAt: "2026-07-10T12:00:00+07:00",
      debtId: debt.id,
    });

    const [result] = await listDebts(USER_ID, false, new Date("2026-07-25T12:00:00+07:00"));
    expect(result?.dueDate).toBe("2026-08-18");
    expect(result?.cycleStartDate).toBe("2026-07-19");
    expect(result?.cycleEndDate).toBe("2026-08-18");
    expect(result?.amountPaidThisCycleSatang).toBe(0);
  });

  it("reproduces the exact reported bug: a legacy debt (no stored cycle window) paid before its due date must not show overdue with ฿0 paid", async () => {
    // Rabbit Cash: due 2026-07-15, no cycle_start_date/cycle_end_date ever
    // persisted (a debt created before per-cycle tracking existed). Paid
    // ฿2,000 against a ฿1,100 bill on 2026-07-06 -- before the due date.
    // Viewed on 2026-07-18 (3 days after the due date, matching the
    // reported screenshots), the debt must backfill a derived cycle window
    // from its due date, recognize the payment fell inside that cycle, and
    // -- since today is now past that cycle's end -- roll forward to a
    // fresh not-yet-due cycle instead of staying stuck showing "overdue"
    // with the payment uncounted.
    const debt = await createDebt(USER_ID, {
      name: "Rabbit Cash",
      amountDueSatang: 1_100_00,
      minimumPaymentSatang: 1_100_00,
      dueDate: "2026-07-15",
    });
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = undefined;
    stored.cycleEndDate = undefined;

    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 2_000_00,
      occurredAt: "2026-07-06T07:24:00+07:00",
      debtId: debt.id,
    });

    const [result] = await listDebts(USER_ID, false, new Date("2026-07-18T12:00:00+07:00"));
    expect(result?.dueDate).toBe("2026-08-15");
    expect(result?.cycleStartDate).toBe("2026-07-16");
    expect(result?.cycleEndDate).toBe("2026-08-15");
    expect(result?.amountPaidThisCycleSatang).toBe(0);
  });

  it("leaves a debt with neither a cycle window nor a due date on the calendar-month fallback (nothing to derive from)", async () => {
    const debt = await createDebt(USER_ID, {
      name: "No Due Date",
      amountDueSatang: 100_00,
      minimumPaymentSatang: 100_00,
      dueDate: "2026-07-18",
    });
    const stored = getMockState().debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = undefined;
    stored.cycleEndDate = undefined;
    stored.dueDate = undefined;

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
    expect(result?.dueDate).toBe("2026-07-02");
  });
});
