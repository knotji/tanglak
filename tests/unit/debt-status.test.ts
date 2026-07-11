import { describe, expect, it } from "vitest";
import { debtDueStatus, debtDueStatusLabel, hasUnmetMinimumThisCycle } from "@/lib/finance/debt-status";
import type { Debt } from "@/types/domain";

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-a",
    name: "บัตรเครดิต A",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    outstandingBalanceSatang: 10_000_00,
    amountDueSatang: 2_000_00,
    minimumPaymentSatang: 1_000_00,
    amountPaidThisCycleSatang: 0,
    status: "active",
    ...overrides,
  };
}

const TODAY = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15

describe("debtDueStatus — Bangkok-relative due-date boundaries", () => {
  it("is overdue when the due date has passed and minimum is unmet", () => {
    expect(debtDueStatus(debt({ dueDate: "2026-07-14" }), TODAY)).toBe("overdue");
  });

  it("is due_today on the exact due date", () => {
    expect(debtDueStatus(debt({ dueDate: "2026-07-15" }), TODAY)).toBe("due_today");
  });

  it("is due_soon within the 3-day window", () => {
    expect(debtDueStatus(debt({ dueDate: "2026-07-18" }), TODAY)).toBe("due_soon");
  });

  it("is not_yet_due beyond the 3-day window", () => {
    expect(debtDueStatus(debt({ dueDate: "2026-07-19" }), TODAY)).toBe("not_yet_due");
  });

  it("is not_yet_due when there is no due date at all", () => {
    expect(debtDueStatus(debt({ dueDate: undefined }), TODAY)).toBe("not_yet_due");
  });
});

describe("debtDueStatus — payment satisfaction takes priority over date urgency", () => {
  it("is cycle_paid_in_full once paidThisCycle meets the full statement amount, even overdue", () => {
    const paidInFull = debt({ dueDate: "2026-07-01", amountDueSatang: 2_000_00, amountPaidThisCycleSatang: 2_000_00 });
    expect(debtDueStatus(paidInFull, TODAY)).toBe("cycle_paid_in_full");
  });

  it("is minimum_paid once paidThisCycle meets the minimum but not the full statement amount", () => {
    const minPaid = debt({ dueDate: "2026-07-01", amountDueSatang: 2_000_00, minimumPaymentSatang: 1_000_00, amountPaidThisCycleSatang: 1_000_00 });
    expect(debtDueStatus(minPaid, TODAY)).toBe("minimum_paid");
  });

  it("never infers paid-in-full from outstandingBalanceSatang reaching zero", () => {
    // Outstanding balance is unrelated to this-cycle payment status -- a
    // debt with zero outstanding but no recorded cycle payment must not
    // report as paid for this cycle.
    const zeroBalance = debt({ dueDate: "2026-07-01", outstandingBalanceSatang: 0, amountPaidThisCycleSatang: 0 });
    expect(debtDueStatus(zeroBalance, TODAY)).toBe("overdue");
  });
});

describe("debtDueStatusLabel", () => {
  it("returns the exact required Thai labels", () => {
    expect(debtDueStatusLabel(debt({ dueDate: "2026-07-19" }), TODAY)).toBe("ยังไม่ถึงกำหนด");
    expect(debtDueStatusLabel(debt({ dueDate: "2026-07-18" }), TODAY)).toBe("ใกล้ครบกำหนด");
    expect(debtDueStatusLabel(debt({ dueDate: "2026-07-15" }), TODAY)).toBe("ครบกำหนดวันนี้");
    expect(debtDueStatusLabel(debt({ dueDate: "2026-07-01" }), TODAY)).toBe("เกินกำหนด");
    expect(
      debtDueStatusLabel(debt({ dueDate: "2026-07-01", minimumPaymentSatang: 1_000_00, amountPaidThisCycleSatang: 1_000_00 }), TODAY),
    ).toBe("จ่ายขั้นต่ำแล้ว");
    expect(
      debtDueStatusLabel(debt({ dueDate: "2026-07-01", amountDueSatang: 2_000_00, amountPaidThisCycleSatang: 2_000_00 }), TODAY),
    ).toBe("จ่ายครบยอดรอบนี้แล้ว");
  });
});

describe("hasUnmetMinimumThisCycle", () => {
  it("is true when paidThisCycle is below the minimum", () => {
    expect(hasUnmetMinimumThisCycle(debt({ minimumPaymentSatang: 1_000_00, amountPaidThisCycleSatang: 500_00 }))).toBe(true);
  });

  it("is false once paidThisCycle meets or exceeds the minimum", () => {
    expect(hasUnmetMinimumThisCycle(debt({ minimumPaymentSatang: 1_000_00, amountPaidThisCycleSatang: 1_000_00 }))).toBe(false);
  });
});
