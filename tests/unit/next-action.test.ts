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

const exceedingForecast = {
  trailingWindowDaysUsed: 7,
  trailingSpendSatang: 7_000,
  averageDailySpendSatang: 1_000,
  remainingDaysInMonth: 16,
  projectedAdditionalSpendSatang: 16_000,
  projectedMonthEndSpendSatang: 40_000,
  remainingBudgetSatang: 5_000,
  projectedBudgetVarianceSatang: -11_000,
  onTrackToExceedBudget: true,
  projectedBudgetExhaustionDate: "2026-07-20",
  daysEarlyOrLate: 11,
};

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

  it("lets due debt urgency outrank a portfolio recommendation", () => {
    const action = determineNextAction(
      {
        debts: [debt({ id: "urgent", dueDate: "2026-07-15" }), debt({ id: "focus", amountPaidThisCycleSatang: 1_000_00 })],
        hasBudget: true,
        hasAnyTransaction: true,
        portfolioRecommendation: {
          recommendedStrategy: "avalanche",
          focusDebtId: "focus",
          estimatedInterestSavingSatang: 1_000_00,
          reason: "แนะนำลดดอกเบี้ยก่อน",
        },
      },
      TODAY,
    );

    expect(action.title).toBe("ครบกำหนดชำระวันนี้");
    expect(action.actionHref).toBe("/debts");
  });

  it("lets overdue debt urgency outrank a portfolio recommendation", () => {
    const action = determineNextAction(
      {
        debts: [debt({ id: "overdue", dueDate: "2026-07-01" }), debt({ id: "focus", amountPaidThisCycleSatang: 1_000_00 })],
        hasBudget: true,
        hasAnyTransaction: true,
        portfolioRecommendation: {
          recommendedStrategy: "snowball",
          focusDebtId: "focus",
          estimatedInterestSavingSatang: 0,
          reason: "แนะนำปิดก้อนเล็กก่อน",
        },
      },
      TODAY,
    );

    expect(action.tone).toBe("overdue");
    expect(action.actionHref).toBe("/debts");
  });

  it("surfaces portfolio advice below existing higher-priority action tiers", () => {
    const focus = debt({
      id: "focus",
      name: "สินเชื่อดอกสูง",
      minimumPaymentSatang: 1_000_00,
      amountPaidThisCycleSatang: 1_000_00,
      dueDate: "2026-07-25",
    });
    const other = debt({
      id: "other",
      minimumPaymentSatang: 1_000_00,
      amountPaidThisCycleSatang: 1_000_00,
      dueDate: "2026-07-25",
    });
    const action = determineNextAction(
      {
        debts: [focus, other],
        hasBudget: true,
        hasAnyTransaction: true,
        portfolioRecommendation: {
          recommendedStrategy: "avalanche",
          focusDebtId: "focus",
          estimatedInterestSavingSatang: 1_000_00,
          reason: "แนะนำลดดอกเบี้ยก่อน เพราะคาดว่าจะลดดอกเบี้ยรวมได้",
        },
      },
      TODAY,
    );

    expect(action.title).toContain("สินเชื่อดอกสูง");
    expect(action.body).toContain("ลดดอกเบี้ยก่อน");
    expect(action.actionHref).toBe("/debts/strategy");
  });

  it("does not surface portfolio advice when the recommendation is missing or has no focus debt", () => {
    const paidMinimum = debt({
      minimumPaymentSatang: 1_000_00,
      amountPaidThisCycleSatang: 1_000_00,
      dueDate: "2026-07-25",
    });
    const action = determineNextAction(
      {
        debts: [paidMinimum],
        hasBudget: true,
        hasAnyTransaction: true,
        portfolioRecommendation: null,
      },
      TODAY,
    );

    expect(action.title).toBe("เดือนนี้ยังอยู่ในแผน");
  });

  it("lets overdue debt urgency outrank a spend forecast", () => {
    const action = determineNextAction(
      {
        debts: [debt({ dueDate: "2026-07-01" })],
        hasBudget: true,
        hasAnyTransaction: true,
        spendForecast: exceedingForecast,
      },
      TODAY,
    );

    expect(action.tone).toBe("overdue");
    expect(action.title).not.toContain("งบหมด");
  });

  it("lets due-soon debt urgency outrank a spend forecast", () => {
    const action = determineNextAction(
      {
        debts: [debt({ dueDate: "2026-07-17" })],
        hasBudget: true,
        hasAnyTransaction: true,
        spendForecast: exceedingForecast,
      },
      TODAY,
    );

    expect(action.title).toBe("ใกล้ครบกำหนดชำระ");
    expect(action.actionHref).toBe("/debts");
  });

  it("lets unmet minimum payment outrank a spend forecast", () => {
    const action = determineNextAction(
      {
        debts: [debt({ dueDate: "2026-07-25" })],
        hasBudget: true,
        hasAnyTransaction: true,
        spendForecast: exceedingForecast,
      },
      TODAY,
    );

    expect(action.title).toContain("ยังชำระไม่ถึงยอดขั้นต่ำ");
    expect(action.actionHref).toBe("/debts");
  });

  it("lets existing budget actions outrank a spend forecast", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        overspentCategoryLabel: "อาหาร",
        hasAnyTransaction: true,
        spendForecast: exceedingForecast,
      },
      TODAY,
    );

    expect(action.title).toContain("เกินงบ");
    expect(action.title).not.toContain("งบหมด");
  });

  it("lets portfolio strategy outrank a spend forecast", () => {
    const paidMinimum = debt({
      id: "focus",
      name: "สินเชื่อดอกสูง",
      minimumPaymentSatang: 1_000_00,
      amountPaidThisCycleSatang: 1_000_00,
      dueDate: "2026-07-25",
    });
    const action = determineNextAction(
      {
        debts: [paidMinimum],
        hasBudget: true,
        hasAnyTransaction: true,
        portfolioRecommendation: {
          recommendedStrategy: "avalanche",
          focusDebtId: "focus",
          estimatedInterestSavingSatang: 1_000_00,
          reason: "แนะนำลดดอกเบี้ยก่อน",
        },
        spendForecast: exceedingForecast,
      },
      TODAY,
    );

    expect(action.title).toContain("สินเชื่อดอกสูง");
    expect(action.actionHref).toBe("/debts/strategy");
  });

  it("surfaces spend forecast advice only at the lowest advisory tier", () => {
    const action = determineNextAction(
      {
        debts: [],
        hasBudget: true,
        hasAnyTransaction: true,
        spendForecast: exceedingForecast,
      },
      TODAY,
    );

    expect(action.title).toBe("ระวังงบหมดก่อนสิ้นเดือน");
    expect(action.body).toContain("7 วันที่ผ่านมา");
    expect(action.body).toContain("฿110");
    expect(action.action).toBe("ดูและปรับงบ");
    expect(action.actionHref).toBe("/budget");
  });

  it("does not surface spend forecast advice when forecast is on track or missing", () => {
    const onTrack = { ...exceedingForecast, onTrackToExceedBudget: false };
    const baseInput = {
      debts: [],
      hasBudget: true,
      hasAnyTransaction: true,
    };

    expect(determineNextAction({ ...baseInput, spendForecast: onTrack }, TODAY).title).toBe("เดือนนี้ยังอยู่ในแผน");
    expect(determineNextAction({ ...baseInput, spendForecast: null }, TODAY).title).toBe("เดือนนี้ยังอยู่ในแผน");
  });

  it("does not mutate the spend forecast input", () => {
    const forecast = structuredClone(exceedingForecast);
    const before = structuredClone(forecast);

    determineNextAction(
      {
        debts: [],
        hasBudget: true,
        hasAnyTransaction: true,
        spendForecast: forecast,
      },
      TODAY,
    );

    expect(forecast).toEqual(before);
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
