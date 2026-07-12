import type {
  DebtSimulationInput,
  DebtSimulationOutput,
  ExtraPaymentBehavior,
} from "./payment-types";

/**
 * Calculates the monthly interest rate from annual rate or uses monthly rate directly.
 */
export function getMonthlyRatePercent(ratePercent: number, period: "monthly" | "annual"): number {
  if (ratePercent <= 0) return 0;
  return period === "annual" ? ratePercent / 12 : ratePercent;
}

/**
 * Runs a deterministic projection of the debt payoff.
 * Returns the schedule or totals.
 */
export function simulateDebtPayment(input: DebtSimulationInput): DebtSimulationOutput {
  const {
    balanceSatang,
    interestRatePercent,
    interestRatePeriod,
    minimumPaymentSatang,
    paymentAmountSatang,
    dueDate,
    nextInterestSatang,
    extraPaymentBehavior,
    earlyPayoffFeeSatang = 0,
    plannedIncomeSatang,
    currentMonthSpendingSatang,
    debtPaymentsThisMonthSatang,
    minimumCashReserveSatang,
    safeBufferSatang,
  } = input;

  const warnings: string[] = [];
  const assumptions: string[] = [];

  // 1. Basic Validations & Warnings
  if (balanceSatang < 0) {
    throw new Error("Outstanding balance cannot be negative");
  }
  if (minimumPaymentSatang < 0) {
    throw new Error("Minimum payment cannot be negative");
  }
  if (paymentAmountSatang < 0) {
    throw new Error("Payment amount cannot be negative");
  }

  // 2. Interest Rate Setup
  const monthlyRatePercent = getMonthlyRatePercent(interestRatePercent, interestRatePeriod);
  if (interestRatePeriod === "annual") {
    assumptions.push("คำนวณโดยแปลงอัตราดอกเบี้ยรายปีเป็นรายเดือนแบบหาร 12 (Nominal Rate)");
  } else {
    assumptions.push("คำนวณจากดอกเบี้ยแบบรายเดือนโดยตรง");
  }
  assumptions.push("สมมติว่าอัตราดอกเบี้ยไม่เปลี่ยนแปลงตลอดอายุสัญญา");
  assumptions.push("สมมติว่าชำระตรงเวลาทุกงวดและไม่มีการค้างชำระ");

  // 3. First Month's Interest Calculation
  // If nextInterestSatang is provided, we use it for the current cycle's interest portion.
  // Otherwise, we calculate it using the interest rate.
  let firstMonthInterest = 0;
  if (nextInterestSatang !== undefined && nextInterestSatang >= 0) {
    firstMonthInterest = nextInterestSatang;
    assumptions.push(`ใช้ดอกเบี้ยงวดถัดไปที่ระบุจำนวน ${nextInterestSatang / 100} บาท สำหรับงวดปัจจุบัน`);
  } else {
    firstMonthInterest = Math.round(balanceSatang * (monthlyRatePercent / 100));
  }
  firstMonthInterest = Math.max(0, firstMonthInterest);

  // 4. Calculate actual payment amount capped at payoff amount (outstanding + interest + early payoff fee if fully paid)
  // Payoff amount without early payoff fee
  const basicPayoffAmount = balanceSatang + firstMonthInterest;
  const fullPayoffAmount = basicPayoffAmount + earlyPayoffFeeSatang;

  let actualPaymentThisMonth = paymentAmountSatang;
  let isFullyPaidThisMonth = false;

  if (actualPaymentThisMonth >= fullPayoffAmount) {
    actualPaymentThisMonth = fullPayoffAmount;
    isFullyPaidThisMonth = true;
  } else if (actualPaymentThisMonth >= basicPayoffAmount) {
    // If they pay at least basicPayoffAmount, we cap it at basicPayoff (or full payoff depending on fee)
    actualPaymentThisMonth = basicPayoffAmount;
    isFullyPaidThisMonth = true;
  }

  // First month allocation
  const interestPaidThisPayment = Math.min(firstMonthInterest, actualPaymentThisMonth);
  let remainingAfterInterest = actualPaymentThisMonth - interestPaidThisPayment;

  let feePaid = 0;
  if (isFullyPaidThisMonth && earlyPayoffFeeSatang > 0) {
    feePaid = Math.min(earlyPayoffFeeSatang, remainingAfterInterest);
    remainingAfterInterest -= feePaid;
    assumptions.push(`รวมค่าธรรมเนียมการปิดบัญชีก่อนกำหนดจำนวน ${earlyPayoffFeeSatang / 100} บาท`);
  }

  const principalPaidThisPayment = Math.min(balanceSatang, remainingAfterInterest);
  const balanceAfterPayment = balanceSatang - principalPaidThisPayment;

  // Next period interest (month 2)
  let nextPeriodInterest = Math.round(balanceAfterPayment * (monthlyRatePercent / 100));
  nextPeriodInterest = Math.max(0, nextPeriodInterest);

  // Warning check: If payment doesn't cover interest
  if (actualPaymentThisMonth <= firstMonthInterest && balanceSatang > 0) {
    if (actualPaymentThisMonth < firstMonthInterest) {
      warnings.push("ยอดชำระน้อยกว่าดอกเบี้ยที่เกิดขึ้นในงวดนี้ ซึ่งจะทำให้ยอดหนี้สะสมเพิ่มขึ้น");
    } else {
      warnings.push("ยอดชำระเท่ากับดอกเบี้ยพอดี ซึ่งจะไม่ลดเงินต้นเลย");
    }
  }

  // Lender behavior warning and logic
  let precisionLevel: "full" | "limited" | "none" = "full";
  if (extraPaymentBehavior === "unknown") {
    precisionLevel = "limited";
    warnings.push("ควรตรวจสอบกับผู้ให้กู้ก่อนว่าเงินที่จ่ายเกินขั้นต่ำจะถูกนำไปลดเงินต้นหรือไม่");
    assumptions.push("สมมติว่าผู้ให้กู้นำเงินส่วนเกินขั้นต่ำไปลดเงินต้นทันที (กรณียังไม่ยืนยันเงื่อนไข)");
  } else if (extraPaymentBehavior === "advance_installment") {
    warnings.push("ผู้ให้กู้อาจจัดสรรเงินส่วนเกินเป็นยอดชำระล่วงหน้า (Advance) ซึ่งอาจไม่ช่วยลดเงินต้นในรอบนี้");
    assumptions.push("คำนวณตามเงื่อนไขที่เงินส่วนเกินไม่ลดเงินต้นเพื่อคำนวณดอกเบี้ย (Advance Installment)");
  }

  // 5. Future Projection Simulation (Month 2 onwards)
  // We need to compare this plan's projection with a baseline Minimum Payment plan projection
  // to calculate "estimated payoff date" and "interest saved".

  // Function to project a specific payment behavior and amount
  const projectAmortization = (
    startBalance: number,
    periodicPayment: number,
    behavior: ExtraPaymentBehavior
  ) => {
    let currentBalance = startBalance;
    let totalInterest = firstMonthInterest;
    let months = 1;

    // If already paid off in month 1
    if (currentBalance <= 0) {
      return { months, totalInterest, doesAmortize: true };
    }

    const maxMonths = 600;
    let doesAmortize = true;

    // For advance_installment, we assume extra payment amount does not reduce interest-bearing principal
    // compared to the minimum plan. So interest for subsequent periods is calculated on the minimum payment schedule's balance.
    // Let's model it carefully:
    let minPlanBalance = startBalance;

    while (currentBalance > 0 && months < maxMonths) {
      // Calculate interest on the current balance (or minPlanBalance if advance_installment)
      const interestBasis = behavior === "advance_installment" ? minPlanBalance : currentBalance;
      let interest = Math.round(interestBasis * (monthlyRatePercent / 100));
      interest = Math.max(0, interest);

      // Under advance_installment, we also track the mock minimum plan's balance to know the interest basis
      if (behavior === "advance_installment") {
        let minInterest = Math.round(minPlanBalance * (monthlyRatePercent / 100));
        minInterest = Math.max(0, minInterest);
        const minPayment = Math.min(minimumPaymentSatang, minPlanBalance + minInterest);
        const minPrincipal = Math.max(0, minPayment - minInterest);
        minPlanBalance = Math.max(0, minPlanBalance - minPrincipal);
      }

      // Check if periodicPayment can cover interest (to prevent infinite loop or non-amortization)
      if (periodicPayment <= interest) {
        doesAmortize = false;
        break;
      }

      const payoff = currentBalance + interest;
      const actualPay = Math.min(periodicPayment, payoff);
      const interestPaid = Math.min(interest, actualPay);
      const principalPaid = actualPay - interestPaid;

      currentBalance -= principalPaid;
      totalInterest += interest;
      months++;
    }

    return {
      months,
      totalInterest,
      doesAmortize: currentBalance <= 0 && doesAmortize,
    };
  };

  // Run Baseline (Minimum Plan) projection
  // In the minimum plan, the payment this month is minimumPaymentSatang
  const minBaseline = projectAmortization(
    balanceAfterPayment, // start after month 1 payment
    minimumPaymentSatang,
    "reduce_principal" // Baseline minimum is computed normally
  );

  // Run This Plan's projection
  const currentPlan = projectAmortization(
    balanceAfterPayment,
    paymentAmountSatang, // subsequent payments are paymentAmountSatang
    extraPaymentBehavior
  );

  // If the payment is below minimum or if it doesn't amortize:
  let estimatedInstallmentsRemaining: number | null = null;
  let estimatedPayoffDate: string | null = null;
  let estimatedRemainingInterest = 0;
  let interestSavedVsMinimum = 0;

  if (currentPlan.doesAmortize) {
    estimatedInstallmentsRemaining = currentPlan.months;
    estimatedRemainingInterest = currentPlan.totalInterest - interestPaidThisPayment;

    // Calculate payoff date
    if (dueDate) {
      const start = new Date(dueDate);
      // Add months
      start.setMonth(start.getMonth() + (currentPlan.months - 1));
      const thaiYear = start.getFullYear() + 543;
      const monthNames = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
      ];
      estimatedPayoffDate = `${monthNames[start.getMonth()]} ${thaiYear}`;
    }
  } else {
    estimatedInstallmentsRemaining = null;
    estimatedPayoffDate = null;
    estimatedRemainingInterest = 0;
    warnings.push("ยอดชำระเฉลี่ยต่ำเกินไปสำหรับการชำระหนี้ให้หมด (หนี้ไม่ลดลงหรือลดลงช้ามาก)");
  }

  // Calculate interest saved compared to minimum plan
  if (minBaseline.doesAmortize && currentPlan.doesAmortize) {
    // If advance_installment, we do not claim guaranteed interest savings from principal reduction
    if (extraPaymentBehavior === "advance_installment") {
      interestSavedVsMinimum = 0;
    } else {
      interestSavedVsMinimum = Math.max(0, minBaseline.totalInterest - currentPlan.totalInterest);
    }
  } else {
    interestSavedVsMinimum = 0;
  }

  // 6. Financial Context & Affordability calculations
  let cashRemainingAfterPayment: number | null = null;
  let affordabilityStatus: DebtSimulationOutput["affordabilityStatus"] = "insufficient_data";

  const hasContext =
    plannedIncomeSatang !== undefined &&
    currentMonthSpendingSatang !== undefined &&
    debtPaymentsThisMonthSatang !== undefined;

  if (hasContext) {
    // The user has already paid some debt this month.
    // If they pay the simulated amount this month, their remaining cash is:
    // cashRemaining = plannedIncome - actual spending - debtPaymentsThisMonth (excluding this debt if this is the first payment, or including it?
    // Wait! Let's check: "debtPaymentsAlreadyMadeThisMonth" in the app usually includes payments for ALL debts.
    // So if the user is deciding how much to pay *for this debt*, the payment for this debt this month is `actualPaymentThisMonth`.
    // So cash remaining after payment = plannedIncome - actual spending - debtPaymentsAlreadyMadeThisMonth - actualPaymentThisMonth
    // Wait, let's make sure if `debtPaymentsThisMonthSatang` already includes a payment for this debt, we adjust it, or if it does not.
    // In typical budgets, we subtract the new payment.
    // Let's implement:
    const remainingCash =
      plannedIncomeSatang -
      currentMonthSpendingSatang -
      debtPaymentsThisMonthSatang -
      actualPaymentThisMonth;

    cashRemainingAfterPayment = remainingCash;

    const minReserve = minimumCashReserveSatang || 0;
    const safeBuffer = safeBufferSatang || 0;

    if (remainingCash >= minReserve + safeBuffer) {
      affordabilityStatus = "safe";
    } else if (remainingCash >= minReserve) {
      affordabilityStatus = "tight";
    } else {
      affordabilityStatus = "risky";
    }

    const availableCashBeforeThis = plannedIncomeSatang - currentMonthSpendingSatang - debtPaymentsThisMonthSatang;
    if (availableCashBeforeThis < minimumPaymentSatang) {
      warnings.push("เงินเหลือเดือนนี้อาจไม่พอสำหรับยอดขั้นต่ำ");
    }
  } else {
    affordabilityStatus = "insufficient_data";
  }

  return {
    paymentAmountSatang: actualPaymentThisMonth,
    interestPaidThisPaymentSatang: interestPaidThisPayment,
    principalPaidThisPaymentSatang: principalPaidThisPayment,
    balanceAfterPaymentSatang: balanceAfterPayment,
    nextPeriodInterestSatang: nextPeriodInterest,
    estimatedInstallmentsRemaining,
    estimatedPayoffDate,
    estimatedRemainingInterestSatang: Math.max(0, estimatedRemainingInterest),
    interestSavedVsMinimumSatang: interestSavedVsMinimum,
    cashRemainingAfterPaymentSatang: cashRemainingAfterPayment,
    affordabilityStatus,
    warnings,
    assumptions,
    precisionLevel,
  };
}
