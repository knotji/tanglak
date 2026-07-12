import { describe, it, expect } from "vitest";
import { simulateDebtPayment } from "../../src/lib/debt/payment-simulator";
import { generatePlanOptions } from "../../src/lib/debt/payment-recommendation";
import { formatTHB } from "../../src/lib/finance/money";

describe("Debt Payment Simulator Engine", () => {
  const baseInput = {
    balanceSatang: 1000000, // ฿10,000
    interestRatePercent: 12, // 12% annual
    interestRatePeriod: "annual" as const,
    minimumPaymentSatang: 100000, // ฿1,000
    dueDate: "2026-08-19",
    extraPaymentBehavior: "reduce_principal" as const,
  };

  // Case 1: Minimum payment with monthly interest
  it("calculates minimum payment with monthly interest correctly", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 100000, // ฿1,000
    });
    expect(res.interestPaidThisPaymentSatang).toBe(10000); // 10,000 * 1% = 100
    expect(res.principalPaidThisPaymentSatang).toBe(90000); // 1,000 - 100 = 900
    expect(res.balanceAfterPaymentSatang).toBe(910000); // 10,000 - 900 = 9,100
  });

  // Case 2: Payment above minimum reduces more principal
  it("verifies payment above minimum reduces more principal", () => {
    const resMin = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 100000, // ฿1,000
    });
    const resExtra = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 200000, // ฿2,000
    });
    expect(resExtra.principalPaidThisPaymentSatang).toBeGreaterThan(resMin.principalPaidThisPaymentSatang);
    expect(resExtra.balanceAfterPaymentSatang).toBeLessThan(resMin.balanceAfterPaymentSatang);
  });

  // Case 3 & 4: Larger payment shortens payoff duration and reduces remaining interest
  it("verifies larger payment shortens payoff duration and reduces remaining interest", () => {
    const resMin = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 100000,
    });
    const resExtra = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 200000,
    });
    if (resMin.estimatedInstallmentsRemaining && resExtra.estimatedInstallmentsRemaining) {
      expect(resExtra.estimatedInstallmentsRemaining).toBeLessThan(resMin.estimatedInstallmentsRemaining);
    }
    expect(resExtra.estimatedRemainingInterestSatang).toBeLessThan(resMin.estimatedRemainingInterestSatang);
  });

  // Case 5: Payment below periodic interest produces warning
  it("produces warning when payment is below periodic interest", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 5000, // ฿50 (interest is ฿100)
    });
    expect(res.warnings).toContain("ยอดชำระน้อยกว่าดอกเบี้ยที่เกิดขึ้นในงวดนี้ ซึ่งจะทำให้ยอดหนี้สะสมเพิ่มขึ้น");
  });

  // Case 6: Payment equal to periodic interest does not amortize
  it("warns when payment is equal to periodic interest and does not amortize", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 10000, // ฿100 (exactly interest)
    });
    expect(res.warnings).toContain("ยอดชำระเท่ากับดอกเบี้ยพอดี ซึ่งจะไม่ลดเงินต้นเลย");
    expect(res.estimatedInstallmentsRemaining).toBeNull();
  });

  // Case 7: Payment above payoff amount is capped safely
  it("caps payment safely at payoff amount plus early payoff fee", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 2000000, // ฿20,000 (balance is ฿10,000 + interest ฿100)
      earlyPayoffFeeSatang: 50000, // ฿500 fee
    });
    expect(res.paymentAmountSatang).toBe(1060000); // ฿10,000 balance + ฿100 interest + ฿500 fee
    expect(res.balanceAfterPaymentSatang).toBe(0);
  });

  // Case 8: Zero-interest debt
  it("handles zero-interest debt correctly", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      interestRatePercent: 0,
      paymentAmountSatang: 200000,
    });
    expect(res.interestPaidThisPaymentSatang).toBe(0);
    expect(res.principalPaidThisPaymentSatang).toBe(200000);
    expect(res.balanceAfterPaymentSatang).toBe(800000);
  });

  // Case 9: Monthly interest rate
  it("uses monthly interest rate directly", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      interestRatePercent: 2.75,
      interestRatePeriod: "monthly",
      paymentAmountSatang: 500000,
    });
    // monthly interest: 10,000 * 2.75% = 275
    expect(res.interestPaidThisPaymentSatang).toBe(27500);
  });

  // Case 10: Annual interest rate conversion
  it("converts annual nominal rate to monthly rate by dividing by 12", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      interestRatePercent: 12,
      interestRatePeriod: "annual",
      paymentAmountSatang: 500000,
    });
    // monthly interest: 10,000 * (12/12)% = 100
    expect(res.interestPaidThisPaymentSatang).toBe(10000);
  });

  // Case 11: reduce_principal behavior
  it("simulates reduce_principal behavior with correct interest savings", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      extraPaymentBehavior: "reduce_principal",
      paymentAmountSatang: 200000,
    });
    expect(res.interestSavedVsMinimumSatang).toBeGreaterThan(0);
  });

  // Case 12: advance_installment behavior
  it("simulates advance_installment behavior without claiming interest savings", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      extraPaymentBehavior: "advance_installment",
      paymentAmountSatang: 200000,
    });
    expect(res.interestSavedVsMinimumSatang).toBe(0);
    expect(res.warnings.some(w => w.includes("ยอดชำระล่วงหน้า"))).toBe(true);
  });

  // Case 13: unknown extra-payment behavior
  it("simulates unknown extra-payment behavior with warning and limited precision", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      extraPaymentBehavior: "unknown",
      paymentAmountSatang: 200000,
    });
    expect(res.precisionLevel).toBe("limited");
    expect(res.warnings).toContain("ควรตรวจสอบกับผู้ให้กู้ก่อนว่าเงินที่จ่ายเกินขั้นต่ำจะถูกนำไปลดเงินต้นหรือไม่");
  });

  // Case 14: missing financial context
  it("handles missing financial context correctly", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 200000,
      plannedIncomeSatang: undefined, // missing
    });
    expect(res.affordabilityStatus).toBe("insufficient_data");
    expect(res.cashRemainingAfterPaymentSatang).toBeNull();
  });

  // Case 15, 16, 17, 18: Affordability status matching
  describe("Affordability Status Logic", () => {
    const financialContext = {
      plannedIncomeSatang: 3000000, // ฿30,000
      currentMonthSpendingSatang: 1500000, // ฿15,000
      debtPaymentsThisMonthSatang: 200000, // ฿2,000
      minimumCashReserveSatang: 500000, // ฿5,000
      safeBufferSatang: 300000, // ฿3,000
    };

    it("assigns safe status if cash remains above reserve + safe buffer", () => {
      const res = simulateDebtPayment({
        ...baseInput,
        ...financialContext,
        paymentAmountSatang: 200000, // ฿2,000 payment
      });
      // Remaining = 30k - 15k - 2k - 2k = 11k (reserve + buffer is 5k + 3k = 8k)
      expect(res.affordabilityStatus).toBe("safe");
    });

    it("assigns tight status if cash remains above reserve but below safe buffer", () => {
      const res = simulateDebtPayment({
        ...baseInput,
        ...financialContext,
        paymentAmountSatang: 600000, // ฿6,000 payment
      });
      // Remaining = 30k - 15k - 2k - 6k = 7k (between reserve 5k and reserve + buffer 8k)
      expect(res.affordabilityStatus).toBe("tight");
    });

    it("assigns risky status if cash remains below reserve", () => {
      const res = simulateDebtPayment({
        ...baseInput,
        ...financialContext,
        paymentAmountSatang: 900000, // ฿9,000 payment
      });
      // Remaining = 30k - 15k - 2k - 9k = 4k (below reserve 5k)
      expect(res.affordabilityStatus).toBe("risky");
    });

    it("warns when cash remaining is insufficient for the minimum payment", () => {
      const plans = generatePlanOptions({
        ...baseInput,
        plannedIncomeSatang: 1000000, // ฿10,000
        currentMonthSpendingSatang: 950000, // ฿9,500
        debtPaymentsThisMonthSatang: 100000, // ฿1,000
      });
      expect(plans.minimum.warnings).toContain("เงินเหลือเดือนนี้อาจไม่พอสำหรับยอดขั้นต่ำ");
    });
  });

  // Case 19: accelerated plan respects safety limit
  it("verifies accelerated plan respects safety limits", () => {
    const plans = generatePlanOptions({
      ...baseInput,
      plannedIncomeSatang: 3000000,
      currentMonthSpendingSatang: 1500000,
      debtPaymentsThisMonthSatang: 200000,
      minimumCashReserveSatang: 500000,
      safeBufferSatang: 300000,
    });
    // Should preserve reserve 5,000, meaning cash remaining is at least ฿5,000 (if possible)
    expect(plans.accelerated.cashRemainingAfterPaymentSatang).toBeGreaterThanOrEqual(500000);
  });

  // Case 20, 21, 22: Negative numbers, division by zero, infinite loop prevention
  it("ensures no negative balances or interest are returned", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 5000000, // huge payment
    });
    expect(res.balanceAfterPaymentSatang).toBe(0);
    expect(res.interestPaidThisPaymentSatang).toBeGreaterThanOrEqual(0);
  });

  it("prevents infinite loops and enforces max horizon safety", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 10100, // ฿101, very close to interest ฿100
    });
    expect(res.estimatedInstallmentsRemaining).toBeLessThanOrEqual(600);
  });

  // Case 26: Thai currency formatting
  it("formats Thai currency correctly", () => {
    expect(formatTHB(100000)).toBe("฿1,000");
    expect(formatTHB(123456)).toBe("฿1,234.56");
  });

  // Case 27: Thai payoff-date formatting
  it("formats Thai payoff date correctly", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      paymentAmountSatang: 200000,
    });
    expect(res.estimatedPayoffDate).toMatch(/^[ก-์]+\s\d{4}$/); // matches e.g. "ตุลาคม 2569"
  });

  // Case 28: incomplete existing debt compatibility
  it("renders basic predictions when interest rate or due date is missing", () => {
    const res = simulateDebtPayment({
      ...baseInput,
      interestRatePercent: 0,
      dueDate: undefined,
      paymentAmountSatang: 200000,
    });
    expect(res.estimatedPayoffDate).toBeNull();
    expect(res.estimatedRemainingInterestSatang).toBe(0);
  });
});
