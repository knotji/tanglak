import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDebt, createTransaction, listDebts, updateDebt } from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const USER_ID = "debt-due-date-edit-user";

describe("updateDebt: re-derives the cycle window when due_date changes", () => {
  beforeEach(() => {
    const state = getMockState();
    state.debts = [];
    state.transactions = [];
    state.debtPayments = [];
  });

  it("reproduces the reported bug: editing due_date without touching cycle fields left an on-time payment uncounted, now fixed", async () => {
    // Reproduces "Rabbit Cash": originally due 2026-06-15 (deriving a cycle
    // of roughly 2026-05-16..2026-06-15). A new monthly statement/edit moves
    // the due date forward to 2026-07-15 without the caller ever touching
    // cycle_start_date/cycle_end_date (exactly what saveDebtAction's payload
    // and the document-review "update existing debt" path both do -- neither
    // includes cycle fields at all).
    const debt = await createDebt(USER_ID, {
      name: "Rabbit Cash",
      amountDueSatang: 1_100_00,
      minimumPaymentSatang: 1_100_00,
      dueDate: "2026-06-15",
    });
    expect(debt.cycleStartDate).toBe("2026-05-16");
    expect(debt.cycleEndDate).toBe("2026-06-15");

    // A payment made well before the new due date -- should count once the
    // due date (and, with this fix, the cycle window) reflects July.
    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 2_000_00,
      occurredAt: "2026-07-06T07:24:00+07:00",
      debtId: debt.id,
    });

    const updated = await updateDebt(USER_ID, debt.id, { dueDate: "2026-07-15" });

    // Before this fix, cycleStartDate/cycleEndDate stayed frozen at
    // 2026-05-16/2026-06-15, completely decoupled from the new due date --
    // the July 6 payment landed outside that stale window (and outside
    // wherever the lazy rollover would later drift it to) and never counted.
    expect(updated.dueDate).toBe("2026-07-15");
    expect(updated.cycleStartDate).toBe("2026-06-16");
    expect(updated.cycleEndDate).toBe("2026-07-15");
    expect(updated.amountPaidThisCycleSatang).toBe(2_000_00);

    // Confirm it's not just the return value -- a fresh read agrees, as long
    // as it's still within the (re-derived) current cycle. A read after
    // 2026-07-15 would trigger the separate lazy-rollover mechanism next,
    // which is covered on its own in debt-cycle-rollover.test.ts.
    const [reread] = await listDebts(USER_ID, false, new Date("2026-07-10T12:00:00+07:00"));
    expect(reread?.cycleStartDate).toBe("2026-06-16");
    expect(reread?.cycleEndDate).toBe("2026-07-15");
    expect(reread?.amountPaidThisCycleSatang).toBe(2_000_00);
  });

  it("does not touch the cycle window when the patch doesn't change dueDate", async () => {
    const debt = await createDebt(USER_ID, {
      name: "SAM",
      amountDueSatang: 5_340_00,
      minimumPaymentSatang: 5_340_00,
      dueDate: "2026-07-02",
    });
    await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 5_340_00,
      occurredAt: "2026-06-26T06:41:00+07:00",
      debtId: debt.id,
    });

    const updated = await updateDebt(USER_ID, debt.id, { minimumPaymentSatang: 4_000_00 });

    expect(updated.cycleStartDate).toBe("2026-06-03");
    expect(updated.cycleEndDate).toBe("2026-07-02");
    // Untouched cycle window means the existing cached total is left as-is
    // by this edit (no dueDate change, so no re-derivation/recompute runs).
    expect(updated.amountPaidThisCycleSatang).toBe(5_340_00);
  });

  it("does not re-derive the cycle window when the patch resubmits the same, unchanged dueDate", async () => {
    // The manual edit form always resubmits dueDate on every save (it's a
    // required field on the form), even when the user only changed some
    // other field -- saveDebtAction's payload always includes dueDate
    // (src/app/actions/finance.ts). Keying re-derivation off "is dueDate
    // present in the patch" instead of "did dueDate actually change" would
    // re-derive (and can corrupt) an already-rolled cycle window on every
    // single unrelated edit, e.g. wrongly reopening a previous, already-
    // closed cycle so an old payment counts again.
    const debt = await createDebt(USER_ID, {
      name: "Money HUB",
      outstandingBalanceSatang: 10_000_00,
      amountDueSatang: 2_367_00,
      minimumPaymentSatang: 2_367_00,
      dueDate: "2026-07-19",
    });
    expect(debt.cycleStartDate).toBe("2026-06-20");
    expect(debt.cycleEndDate).toBe("2026-07-19");

    // Simulate the lazy rollover having already advanced the cycle window
    // past what a fresh derivation from dueDate alone would produce (e.g.
    // clamped differently by day-of-month), so a wrongful re-derivation is
    // detectable.
    const state = getMockState();
    const stored = state.debts.find((item) => item.id === debt.id)!;
    stored.cycleStartDate = "2026-07-01";
    stored.cycleEndDate = "2026-07-19";

    const updated = await updateDebt(USER_ID, debt.id, {
      dueDate: "2026-07-19",
      minimumPaymentSatang: 2_500_00,
    });

    expect(updated.minimumPaymentSatang).toBe(2_500_00);
    expect(updated.cycleStartDate).toBe("2026-07-01");
    expect(updated.cycleEndDate).toBe("2026-07-19");
  });

  it("never overrides an explicitly supplied cycle window, even when dueDate also changes", async () => {
    const debt = await createDebt(USER_ID, {
      name: "Money HUB",
      amountDueSatang: 2_367_00,
      minimumPaymentSatang: 2_367_00,
      dueDate: "2026-07-19",
    });

    const updated = await updateDebt(USER_ID, debt.id, {
      dueDate: "2026-08-19",
      cycleStartDate: "2026-07-01",
      cycleEndDate: "2026-08-19",
    });

    expect(updated.dueDate).toBe("2026-08-19");
    expect(updated.cycleStartDate).toBe("2026-07-01");
    expect(updated.cycleEndDate).toBe("2026-08-19");
  });
});
