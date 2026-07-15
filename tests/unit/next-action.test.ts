import { describe, expect, it } from "vitest";
import { determineNextAction } from "@/lib/finance/next-action";
import type { Debt } from "@/types/domain";

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-a",
    name: "บัตรเครดิต A",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    outstandingBalanceSatang: 10_000_00,
    minimumPaymentSatang: 1_000_00,
    amountPaidThisCycleSatang: 0,
    status: "active",
    ...overrides,
  };
}

const TODAY = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15, fixed reference point

describe("determineNextAction — single highest-priority action", () => {
  it("prioritizes an overdue debt above a missing budget and overspent category", () => {
    const overdue = debt({ dueDate: "2026-07-01" }); // 14 days before TODAY
    const action = determineNextAction(
      {
        debts: [overdue],
        hasBudget: false,
        overspentCategoryLabel: "อาหาร",
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.tone).toBe("overdue");
    expect(action.title).toContain("เลยกำหนด");
  });

  it("prioritizes a debt due today above a debt due within 3 days", () => {
    const dueToday = debt({ id: "debt-today", dueDate: "2026-07-15" }); // same day as TODAY
    const dueSoon = debt({ id: "debt-soon", dueDate: "2026-07-17" }); // 2 days after TODAY
    const action = determineNextAction(
      {
        debts: [dueSoon, dueToday],
        hasBudget: false,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toBe("ครบกำหนดชำระวันนี้");
    expect(action.body).toContain(dueToday.name);
    expect(action.body).toContain("และมีหนี้ใกล้ครบกำหนดอีก 1 รายการ");
  });

  it("does not render a due-today debt as 'due in 0 days' merged into the due-soon bucket", () => {
    const dueToday = debt({ dueDate: "2026-07-15" }); // same day as TODAY
    const action = determineNextAction(
      {
        debts: [dueToday],
        hasBudget: false,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).not.toContain("0 วัน");
    expect(action.title).toBe("ครบกำหนดชำระวันนี้");
  });

  it("prioritizes a debt due within 3 days over a missing budget", () => {
    const dueSoon = debt({ dueDate: "2026-07-17" }); // 2 days after TODAY
    const action = determineNextAction(
      {
        debts: [dueSoon],
        hasBudget: false,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.tone).toBe("debt");
    expect(action.title).toBe("ใกล้ครบกำหนดชำระ");
    expect(action.body).toContain("ครบกำหนดใน 2 วัน");
  });

  it("does not treat a debt due more than 3 days out as urgent", () => {
    // Minimum already met so this test isolates date-window behavior from
    // the separate "unmet minimum" priority tier.
    const dueLater = debt({ dueDate: "2026-07-25", minimumPaymentSatang: 1_000_00, amountPaidThisCycleSatang: 1_000_00 });
    const action = determineNextAction(
      {
        debts: [dueLater],
        hasBudget: false,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toBe("ยังไม่ได้ตั้งงบเดือนนี้");
  });

  it("surfaces a debt with an unmet minimum payment above a missing monthly budget", () => {
    const unmet = debt({ dueDate: "2026-07-25", minimumPaymentSatang: 1_000_00, amountPaidThisCycleSatang: 0 });
    const action = determineNextAction(
      {
        debts: [unmet],
        hasBudget: false,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toContain("ยังชำระไม่ถึงยอดขั้นต่ำ");
  });

  it("does not surface the unmet-minimum tier once the minimum has been paid", () => {
    const met = debt({ dueDate: "2026-07-25", minimumPaymentSatang: 1_000_00, amountPaidThisCycleSatang: 1_000_00 });
    const action = determineNextAction(
      {
        debts: [met],
        hasBudget: true,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).not.toContain("ยังชำระไม่ถึงยอดขั้นต่ำ");
  });

  it("surfaces 'no monthly budget' when there is no debt urgency", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: false,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toBe("ยังไม่ได้ตั้งงบเดือนนี้");
    expect(action.actionHref).toBe("/budget");
  });

  it("surfaces an overspent category once a budget exists", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        overspentCategoryLabel: "อาหาร",
        nearLimitCategoryLabel: "เดินทาง",
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toContain("อาหาร");
    expect(action.title).toContain("เกินงบ");
    expect(action.tone).toBe("overdue");
  });

  it("surfaces an unbudgeted-spending category when there is no real overspending", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        unbudgetedCategoryLabel: "อื่น ๆ",
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toBe('หมวด "อื่น ๆ" ยังไม่ได้ตั้งงบ');
    expect(action.title).not.toContain("เกินงบ");
    expect(action.action).toBe("ตั้งงบหมวดนี้");
    expect(action.actionHref).toBe("/budget");
  });

  it("prioritizes a real overspent category above an unbudgeted-spending category", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        overspentCategoryLabel: "อาหาร",
        unbudgetedCategoryLabel: "อื่น ๆ",
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toContain("อาหาร");
    expect(action.title).toContain("เกินงบ");
  });

  it("prioritizes an unbudgeted-spending category above unreviewed items", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        unbudgetedCategoryLabel: "อื่น ๆ",
        unreviewedCount: 5,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toContain("อื่น ๆ");
    expect(action.title).not.toContain("รอตรวจสอบ");
  });

  it("surfaces unreviewed items when there is no budget violation", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        unreviewedCount: 5,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toBe("มีรายการรอตรวจสอบ");
    expect(action.body).toContain("5 รายการ");
    expect(action.actionHref).toBe("/transactions");
  });

  it("prioritizes unreviewed items above a near-limit category", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        unreviewedCount: 5,
        nearLimitCategoryLabel: "เดินทาง",
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toBe("มีรายการรอตรวจสอบ");
    expect(action.title).not.toContain("เดินทาง");
  });

  it("surfaces a near-limit category only when nothing is overspent", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        nearLimitCategoryLabel: "เดินทาง",
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toContain("เดินทาง");
    expect(action.title).toContain("ใกล้เต็มงบ");
  });

  it("prompts for the first transaction when nothing has been recorded yet", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        hasAnyTransaction: false,
      },
      TODAY,
    );
    expect(action.title).toBe("เริ่มจากบันทึกรายการแรก");
  });

  it("falls back to an 'on track' message when everything is healthy", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        hasAnyTransaction: true,
      },
      TODAY,
    );
    expect(action.title).toBe("เดือนนี้ยังอยู่ในแผน");
    expect(action.action).toBeUndefined();
  });

  it("never surfaces a lower-priority signal once a higher one is chosen", () => {
    const action = determineNextAction(
      {
        debts: [debt({ dueDate: "2026-07-01" })],
        hasBudget: false,
        overspentCategoryLabel: "อาหาร",
        nearLimitCategoryLabel: "เดินทาง",
        hasAnyTransaction: false,
      },
      TODAY,
    );
    expect(action.title).not.toContain("งบ");
    expect(action.title).not.toContain("อาหาร");
  });
});
