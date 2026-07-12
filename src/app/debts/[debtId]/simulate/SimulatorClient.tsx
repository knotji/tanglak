"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { formatTHB } from "@/lib/finance/money";
import { generatePlanOptions } from "@/lib/debt/payment-recommendation";
import { simulateDebtPayment } from "@/lib/debt/payment-simulator";
import { formatThaiDate } from "@/lib/debt/payment-formatting";
import { SIMULATOR_ASSUMPTIONS, LENDER_RISK_WARNING, UNKNOWN_BEHAVIOR_WARNING } from "@/lib/debt/payment-assumptions";
import type { Debt } from "@/types/domain";
import type { ExtraPaymentBehavior, AffordabilityStatus } from "@/lib/debt/payment-types";

interface SimulatorClientProps {
  debt: Debt;
  plannedIncomeSatang: number;
  currentMonthSpendingSatang: number;
  debtPaymentsThisMonthSatang: number;
}

export function SimulatorClient({
  debt,
  plannedIncomeSatang: initialIncomeSatang,
  currentMonthSpendingSatang: initialSpendingSatang,
  debtPaymentsThisMonthSatang: initialDebtPaymentsSatang,
}: SimulatorClientProps) {
  // 1. Financial Context States (in Baht for user editing)
  const [plannedIncome, setPlannedIncome] = useState<string>(
    initialIncomeSatang > 0 ? String(initialIncomeSatang / 100) : ""
  );
  const [spending, setSpending] = useState<string>(
    initialSpendingSatang > 0 ? String(initialSpendingSatang / 100) : ""
  );
  const [debtPayments, setDebtPayments] = useState<string>(
    initialDebtPaymentsSatang > 0 ? String(initialDebtPaymentsSatang / 100) : ""
  );
  const [minReserve, setMinReserve] = useState<string>("5000"); // sensible default ฿5,000
  const [safeBuffer, setSafeBuffer] = useState<string>("3000"); // sensible default ฿3,000
  const [extraBehavior, setExtraBehavior] = useState<ExtraPaymentBehavior>("unknown");
  
  // Collapsible settings panel state
  const [showSettings, setShowSettings] = useState<boolean>(false);
  // Collapsible assumptions state
  const [showAssumptions, setShowAssumptions] = useState<boolean>(false);

  // Parse financial inputs to satangs
  const parseToSatang = (val: string): number | undefined => {
    const num = parseFloat(val.replace(/,/g, ""));
    return isNaN(num) || num < 0 ? undefined : Math.round(num * 100);
  };

  const parsedContext = useMemo(() => {
    return {
      plannedIncomeSatang: parseToSatang(plannedIncome),
      currentMonthSpendingSatang: parseToSatang(spending),
      debtPaymentsThisMonthSatang: parseToSatang(debtPayments),
      minimumCashReserveSatang: parseToSatang(minReserve) ?? 0,
      safeBufferSatang: parseToSatang(safeBuffer) ?? 0,
    };
  }, [plannedIncome, spending, debtPayments, minReserve, safeBuffer]);

  // Base simulation variables from debt details
  const balanceSatang = debt.outstandingBalanceSatang ?? debt.originalAmountSatang ?? 0;
  const interestRatePercent = debt.interestRateAnnual ?? 0;
  const minimumPaymentSatang = debt.minimumPaymentSatang ?? debt.amountDueSatang ?? 0;

  // Data completeness indicator
  const completeness = useMemo(() => {
    let score = 0;
    const items = [];
    
    if (balanceSatang > 0) { score += 20; items.push("ยอดคงเหลือ"); }
    if (minimumPaymentSatang > 0) { score += 20; items.push("ยอดขั้นต่ำ"); }
    if (interestRatePercent > 0) { score += 20; items.push("อัตราดอกเบี้ย"); }
    if (debt.dueDate) { score += 20; items.push("วันครบกำหนด"); }
    if (parsedContext.plannedIncomeSatang !== undefined) { score += 20; items.push("ข้อมูลการเงิน"); }
    
    return { score, items };
  }, [balanceSatang, minimumPaymentSatang, interestRatePercent, debt.dueDate, parsedContext.plannedIncomeSatang]);

  // Generate plans comparison data
  const plans = useMemo(() => {
    return generatePlanOptions({
      balanceSatang,
      interestRatePercent,
      interestRatePeriod: "annual",
      minimumPaymentSatang,
      dueDate: debt.dueDate,
      extraPaymentBehavior: extraBehavior,
      plannedIncomeSatang: parsedContext.plannedIncomeSatang,
      currentMonthSpendingSatang: parsedContext.currentMonthSpendingSatang,
      debtPaymentsThisMonthSatang: parsedContext.debtPaymentsThisMonthSatang,
      minimumCashReserveSatang: parsedContext.minimumCashReserveSatang,
      safeBufferSatang: parsedContext.safeBufferSatang,
    });
  }, [
    balanceSatang,
    interestRatePercent,
    minimumPaymentSatang,
    debt.dueDate,
    extraBehavior,
    parsedContext,
  ]);

  // Active plan selection state: default to recommended if context exists, otherwise minimum
  const hasContext = parsedContext.plannedIncomeSatang !== undefined;
  const [selectedPlan, setSelectedPlan] = useState<"minimum" | "recommended" | "accelerated" | "custom">(
    hasContext ? "recommended" : "minimum"
  );

  // Custom payment input state in Baht
  const defaultCustomAmount = () => {
    if (selectedPlan === "minimum") return String(minimumPaymentSatang / 100);
    if (selectedPlan === "recommended") return String(plans.recommendedAmountSatang / 100);
    if (selectedPlan === "accelerated") return String(plans.acceleratedAmountSatang / 100);
    return "";
  };
  const [customAmount, setCustomAmount] = useState<string>(defaultCustomAmount());

  // If a plan is explicitly clicked, update the custom amount state to match
  const handleSelectPlan = (plan: "minimum" | "recommended" | "accelerated") => {
    setSelectedPlan(plan);
    if (plan === "minimum") {
      setCustomAmount(String(minimumPaymentSatang / 100));
    } else if (plan === "recommended") {
      setCustomAmount(String(plans.recommendedAmountSatang / 100));
    } else if (plan === "accelerated") {
      setCustomAmount(String(plans.acceleratedAmountSatang / 100));
    }
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPlan("custom");
    setCustomAmount(e.target.value);
  };

  // Perform live simulation of the currently active custom payment amount or plan
  const activePaymentSatang = useMemo(() => {
    if (selectedPlan !== "custom") {
      if (selectedPlan === "minimum") return minimumPaymentSatang;
      if (selectedPlan === "recommended") return plans.recommendedAmountSatang;
      if (selectedPlan === "accelerated") return plans.acceleratedAmountSatang;
    }
    const parsed = parseFloat(customAmount.replace(/,/g, ""));
    return isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100);
  }, [selectedPlan, customAmount, minimumPaymentSatang, plans]);

  const activeSimulation = useMemo(() => {
    return simulateDebtPayment({
      balanceSatang,
      interestRatePercent,
      interestRatePeriod: "annual",
      minimumPaymentSatang,
      paymentAmountSatang: activePaymentSatang,
      dueDate: debt.dueDate,
      extraPaymentBehavior: extraBehavior,
      plannedIncomeSatang: parsedContext.plannedIncomeSatang,
      currentMonthSpendingSatang: parsedContext.currentMonthSpendingSatang,
      debtPaymentsThisMonthSatang: parsedContext.debtPaymentsThisMonthSatang,
      minimumCashReserveSatang: parsedContext.minimumCashReserveSatang,
      safeBufferSatang: parsedContext.safeBufferSatang,
    });
  }, [
    balanceSatang,
    interestRatePercent,
    minimumPaymentSatang,
    activePaymentSatang,
    debt.dueDate,
    extraBehavior,
    parsedContext,
  ]);

  // Helper to render affordability status badge
  const renderAffordabilityBadge = (status: AffordabilityStatus) => {
    switch (status) {
      case "safe":
        return (
          <span className="inline-flex items-center rounded-full bg-income/10 px-2.5 py-1 text-xs font-bold text-income border border-income/20">
            ปลอดภัย
          </span>
        );
      case "tight":
        return (
          <span className="inline-flex items-center rounded-full bg-debt/10 px-2.5 py-1 text-xs font-bold text-debt border border-debt/20">
            เงินตึง
          </span>
        );
      case "risky":
        return (
          <span className="inline-flex items-center rounded-full bg-overdue/10 px-2.5 py-1 text-xs font-bold text-overdue border border-overdue/20">
            เสี่ยงเงินไม่พอใช้
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-text-secondary border border-border">
            ข้อมูลยังไม่พอ
          </span>
        );
    }
  };

  // Live validation feedback
  const validationError = useMemo(() => {
    if (selectedPlan === "custom") {
      const amt = parseFloat(customAmount.replace(/,/g, ""));
      if (isNaN(amt) || amt <= 0) {
        return { type: "error", message: "กรุณาระบุจำนวนเงินที่ถูกต้องและมากกว่า 0" };
      }
      const satang = Math.round(amt * 100);
      
      const monthlyRatePercent = interestRatePercent / 12;
      const calculatedInterest = Math.round(balanceSatang * (monthlyRatePercent / 100));
      
      if (satang < minimumPaymentSatang) {
        return { type: "warning", message: "จำนวนเงินน้อยกว่ายอดขั้นต่ำที่ต้องชำระตามสัญญา" };
      }
      if (satang <= calculatedInterest && balanceSatang > 0) {
        return { type: "warning", message: "ยอดชำระน้อยกว่าหรือเท่ากับดอกเบี้ยต่อเดือน เงินต้นจะไม่ลดลงเลย" };
      }
      const payoff = balanceSatang + calculatedInterest;
      if (satang > payoff) {
        return { type: "info", message: `ระบบจะจำกัดยอดจ่ายสูงสุดไว้เท่ากับยอดปิดหนี้โดยประมาณที่ ${formatTHB(payoff)}` };
      }
    }
    return null;
  }, [customAmount, selectedPlan, minimumPaymentSatang, balanceSatang, interestRatePercent]);

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="วางแผนจ่ายหนี้" subtitle={debt.name} />
        <Link
          href={`/debts/${debt.id}`}
          className="min-h-11 shrink-0 rounded-[16px] border border-border bg-surface px-4 flex items-center justify-center text-sm font-bold text-text-secondary"
        >
          ย้อนกลับ
        </Link>
      </div>

      {/* TOP SUMMARY CARD */}
      <section className="relative overflow-hidden rounded-[24px] bg-primary text-white p-6 shadow-lg border border-primary/20">
        {/* Subtle decorative radial gradient */}
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary-soft/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">ยอดคงเหลือ</p>
            <p className="tabular mt-1 text-3xl font-extrabold">{formatTHB(balanceSatang)}</p>
          </div>
          <div className="text-right">
            <span className="inline-block text-xs font-bold bg-white/10 rounded-[12px] px-3 py-1.5 backdrop-blur-sm">
              ความสมบูรณ์ข้อมูล {completeness.score}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-white/60 text-xs">ขั้นต่ำที่ต้องจ่าย</p>
            <p className="font-bold mt-1 text-base">{formatTHB(minimumPaymentSatang)}</p>
          </div>
          <div>
            <p className="text-white/60 text-xs">อัตราดอกเบี้ย</p>
            <p className="font-bold mt-1 text-base">{interestRatePercent}% ต่อปี</p>
          </div>
          <div>
            <p className="text-white/60 text-xs">วันครบกำหนด</p>
            <p className="font-bold mt-1 text-base">{debt.dueDate ? formatThaiDate(debt.dueDate) : "ไม่ระบุ"}</p>
          </div>
          <div>
            <p className="text-white/60 text-xs">รูปแบบการชำระส่วนเกิน</p>
            <p className="font-bold mt-1 text-base">
              {extraBehavior === "reduce_principal" ? "ลดต้นลดดอก" : extraBehavior === "advance_installment" ? "จ่ายงวดล่วงหน้า" : "ยังไม่ระบุ"}
            </p>
          </div>
        </div>
      </section>

      {/* WARNING IF LENDER BEHAVIOR IS UNKNOWN */}
      {extraBehavior === "unknown" && (
        <div className="rounded-[16px] bg-debt/10 border border-debt/20 p-4 text-sm text-debt flex items-start gap-3">
          <span className="text-lg leading-none" role="img" aria-label="warning">⚠️</span>
          <div>
            <p className="font-bold">เงื่อนไขการตัดยอดชำระส่วนเกิน</p>
            <p className="mt-1 leading-relaxed">{UNKNOWN_BEHAVIOR_WARNING}</p>
          </div>
        </div>
      )}

      {/* INTERACTIVE SETTINGS PANEL */}
      <section className="rounded-[20px] border border-border bg-surface shadow-sm overflow-hidden">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full min-h-12 px-5 flex items-center justify-between font-bold text-sm text-text-primary hover:bg-muted/50 transition-colors"
          aria-expanded={showSettings}
        >
          <span className="flex items-center gap-2">
            ⚙️ ปรับแต่งข้อมูลทางการเงินและเงื่อนไข {showSettings ? "(ปิด)" : "(ขยาย)"}
          </span>
          <span>{showSettings ? "▲" : "▼"}</span>
        </button>

        {showSettings && (
          <div className="p-5 border-t border-border bg-muted/30 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <label className="space-y-1.5 text-xs font-bold text-text-secondary">
              รายได้รวมเดือนนี้ (บาท)
              <input
                type="text"
                value={plannedIncome}
                onChange={(e) => setPlannedIncome(e.target.value)}
                placeholder="เช่น 30000"
                className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-surface px-3 text-sm font-normal text-text-primary"
              />
            </label>

            <label className="space-y-1.5 text-xs font-bold text-text-secondary">
              ค่าใช้จ่ายทั่วไปเดือนนี้ (บาท)
              <input
                type="text"
                value={spending}
                onChange={(e) => setSpending(e.target.value)}
                placeholder="เช่น 15000"
                className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-surface px-3 text-sm font-normal text-text-primary"
              />
            </label>

            <label className="space-y-1.5 text-xs font-bold text-text-secondary">
              ชำระหนี้อื่นไปแล้วเดือนนี้ (บาท)
              <input
                type="text"
                value={debtPayments}
                onChange={(e) => setDebtPayments(e.target.value)}
                placeholder="เช่น 2000"
                className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-surface px-3 text-sm font-normal text-text-primary"
              />
            </label>

            <label className="space-y-1.5 text-xs font-bold text-text-secondary">
              เงินสำรองขั้นต่ำที่ต้องเหลือ (บาท)
              <input
                type="text"
                value={minReserve}
                onChange={(e) => setMinReserve(e.target.value)}
                placeholder="เช่น 5000"
                className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-surface px-3 text-sm font-normal text-text-primary"
              />
            </label>

            <label className="space-y-1.5 text-xs font-bold text-text-secondary">
              เงินเผื่อความปลอดภัยที่กำหนดเอง (บาท)
              <input
                type="text"
                value={safeBuffer}
                onChange={(e) => setSafeBuffer(e.target.value)}
                placeholder="เช่น 3000"
                className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-surface px-3 text-sm font-normal text-text-primary"
              />
            </label>

            <label className="space-y-1.5 text-xs font-bold text-text-secondary">
              เงื่อนไขเมื่อจ่ายส่วนเกินขั้นต่ำ
              <select
                value={extraBehavior}
                onChange={(e) => setExtraBehavior(e.target.value as ExtraPaymentBehavior)}
                className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-surface px-3 text-sm font-normal text-text-primary"
              >
                <option value="unknown">ไม่ทราบเงื่อนไขผู้ให้กู้ (ประเมินคร่าวๆ)</option>
                <option value="reduce_principal">ลดต้นลดดอก (ลดดอกเบี้ยจริง)</option>
                <option value="advance_installment">จ่ายงวดล่วงหน้า (ไม่ลดเงินต้นทันที)</option>
              </select>
            </label>
          </div>
        )}
      </section>

      {/* PLAN COMPARISON CARDS */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-text-secondary px-1">เปรียบเทียบทางเลือกการชำระเงิน</h3>
        
        <div className="grid gap-4 md:grid-cols-3">
          {/* MINIMUM PLAN CARD */}
          <button
            onClick={() => handleSelectPlan("minimum")}
            className={`text-left rounded-[20px] border p-5 bg-surface transition-all duration-300 transform hover:scale-[1.01] flex flex-col justify-between ${
              selectedPlan === "minimum"
                ? "border-primary ring-2 ring-primary/20 shadow-md"
                : "border-border shadow-sm hover:border-text-secondary/30"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-text-secondary bg-muted px-2 py-0.5 rounded-full">
                  ขั้นต่ำ
                </span>
                {renderAffordabilityBadge(plans.minimum.affordabilityStatus)}
              </div>
              <p className="mt-4 text-[26px] font-extrabold text-text-primary">
                {formatTHB(minimumPaymentSatang)}
              </p>
              <p className="text-xs text-text-secondary mt-1">ชำระตามข้อกำหนดขั้นต่ำ</p>
            </div>
            
            <div className="mt-5 border-t border-border/60 pt-4 space-y-2 text-xs w-full">
              <div className="flex justify-between">
                <span className="text-text-secondary">ระยะเวลาคาดการณ์</span>
                <span className="font-bold tabular">
                  {plans.minimum.estimatedInstallmentsRemaining
                    ? `${plans.minimum.estimatedInstallmentsRemaining} งวด`
                    : "หนี้ไม่ลดลง"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">ดอกเบี้ยคงเหลือรวม</span>
                <span className="font-bold tabular">{formatTHB(plans.minimum.estimatedRemainingInterestSatang)}</span>
              </div>
              {hasContext && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">เงินเหลือหลังจ่าย</span>
                  <span className="font-bold tabular">{formatTHB(plans.minimum.cashRemainingAfterPaymentSatang ?? 0)}</span>
                </div>
              )}
            </div>
          </button>

          {/* RECOMMENDED PLAN CARD */}
          <button
            onClick={() => handleSelectPlan("recommended")}
            className={`text-left rounded-[20px] border p-5 bg-surface transition-all duration-300 transform hover:scale-[1.01] flex flex-col justify-between relative ${
              selectedPlan === "recommended"
                ? "border-income ring-2 ring-income/20 shadow-md"
                : "border-border shadow-sm hover:border-text-secondary/30"
            }`}
          >
            {hasContext && (
              <span className="absolute -top-3 left-4 bg-income text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider shadow">
                แนะนำสำหรับเดือนนี้
              </span>
            )}
            
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-income bg-income/10 px-2 py-0.5 rounded-full">
                  แนะนำ
                </span>
                {renderAffordabilityBadge(plans.recommended.affordabilityStatus)}
              </div>
              <p className="mt-4 text-[26px] font-extrabold text-income">
                {formatTHB(plans.recommendedAmountSatang)}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {plans.recommendedAmountSatang > minimumPaymentSatang
                  ? `จ่ายเพิ่มจากขั้นต่ำ ${formatTHB(plans.recommendedAmountSatang - minimumPaymentSatang)}`
                  : "ชำระเท่าขั้นต่ำตามกำลังจ่ายที่ปลอดภัย"}
              </p>
            </div>
            
            <div className="mt-5 border-t border-border/60 pt-4 space-y-2 text-xs w-full">
              <div className="flex justify-between">
                <span className="text-text-secondary">ระยะเวลาคาดการณ์</span>
                <span className="font-bold text-income tabular">
                  {plans.recommended.estimatedInstallmentsRemaining
                    ? `${plans.recommended.estimatedInstallmentsRemaining} งวด`
                    : "หนี้ไม่ลดลง"}
                  {plans.minimum.estimatedInstallmentsRemaining && plans.recommended.estimatedInstallmentsRemaining && (
                    <span className="text-[10px] font-normal ml-1">
                      (ลดลง {plans.minimum.estimatedInstallmentsRemaining - plans.recommended.estimatedInstallmentsRemaining} งวด)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">ประหยัดดอกเบี้ย</span>
                <span className="font-bold text-income tabular">
                  {formatTHB(plans.recommended.interestSavedVsMinimumSatang)}
                </span>
              </div>
              {hasContext && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">เงินเหลือหลังจ่าย</span>
                  <span className="font-bold tabular">{formatTHB(plans.recommended.cashRemainingAfterPaymentSatang ?? 0)}</span>
                </div>
              )}
            </div>
          </button>

          {/* ACCELERATED PLAN CARD */}
          <button
            onClick={() => handleSelectPlan("accelerated")}
            className={`text-left rounded-[20px] border p-5 bg-surface transition-all duration-300 transform hover:scale-[1.01] flex flex-col justify-between ${
              selectedPlan === "accelerated"
                ? "border-overdue ring-2 ring-overdue/20 shadow-md"
                : "border-border shadow-sm hover:border-text-secondary/30"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-overdue bg-overdue/10 px-2 py-0.5 rounded-full">
                  เร่งปิด
                </span>
                {renderAffordabilityBadge(plans.accelerated.affordabilityStatus)}
              </div>
              <p className="mt-4 text-[26px] font-extrabold text-overdue">
                {formatTHB(plans.acceleratedAmountSatang)}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {plans.acceleratedAmountSatang > minimumPaymentSatang
                  ? `จ่ายเพิ่มจากขั้นต่ำ ${formatTHB(plans.acceleratedAmountSatang - minimumPaymentSatang)}`
                  : "ชำระเท่าขั้นต่ำตามความคุ้มครองความปลอดภัย"}
              </p>
            </div>
            
            <div className="mt-5 border-t border-border/60 pt-4 space-y-2 text-xs w-full">
              <div className="flex justify-between">
                <span className="text-text-secondary">ระยะเวลาคาดการณ์</span>
                <span className="font-bold text-overdue tabular">
                  {plans.accelerated.estimatedInstallmentsRemaining
                    ? `${plans.accelerated.estimatedInstallmentsRemaining} งวด`
                    : "หนี้ไม่ลดลง"}
                  {plans.minimum.estimatedInstallmentsRemaining && plans.accelerated.estimatedInstallmentsRemaining && (
                    <span className="text-[10px] font-normal ml-1">
                      (ลดลง {plans.minimum.estimatedInstallmentsRemaining - plans.accelerated.estimatedInstallmentsRemaining} งวด)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">ประหยัดดอกเบี้ย</span>
                <span className="font-bold text-overdue tabular">
                  {formatTHB(plans.accelerated.interestSavedVsMinimumSatang)}
                </span>
              </div>
              {hasContext && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">เงินเหลือหลังจ่าย</span>
                  <span className="font-bold tabular">{formatTHB(plans.accelerated.cashRemainingAfterPaymentSatang ?? 0)}</span>
                </div>
              )}
            </div>
          </button>
        </div>
      </section>

      {/* CUSTOM PAYMENT SECTION */}
      <section className="rounded-[20px] border border-border bg-surface p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-text-secondary px-1">หรือระบุยอดชำระที่คุณต้องการ</h3>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <input
              type="text"
              value={customAmount}
              onChange={handleCustomAmountChange}
              placeholder="0.00"
              className="min-h-12 w-full rounded-[16px] border border-border px-4 py-2 font-bold tabular text-lg text-text-primary focus:outline-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-sm text-text-secondary">
              บาท
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setSelectedPlan("custom");
                setCustomAmount(String(minimumPaymentSatang / 100));
              }}
              className="min-h-11 rounded-[14px] bg-muted px-4 text-xs font-bold text-primary hover:bg-primary-soft transition-colors"
            >
              ขั้นต่ำ
            </button>
            <button
              onClick={() => {
                setSelectedPlan("custom");
                const current = parseFloat(customAmount.replace(/,/g, "")) || 0;
                setCustomAmount(String(current + 500));
              }}
              className="min-h-11 rounded-[14px] bg-muted px-4 text-xs font-bold text-primary hover:bg-primary-soft transition-colors"
            >
              +฿500
            </button>
            <button
              onClick={() => {
                setSelectedPlan("custom");
                const current = parseFloat(customAmount.replace(/,/g, "")) || 0;
                setCustomAmount(String(current + 1000));
              }}
              className="min-h-11 rounded-[14px] bg-muted px-4 text-xs font-bold text-primary hover:bg-primary-soft transition-colors"
            >
              +฿1,000
            </button>
            <button
              onClick={() => {
                setSelectedPlan("custom");
                const calculatedInterest = Math.round(balanceSatang * ((interestRatePercent / 12) / 100));
                const payoff = balanceSatang + calculatedInterest;
                setCustomAmount(String(payoff / 100));
              }}
              className="min-h-11 rounded-[14px] bg-muted px-4 text-xs font-bold text-primary hover:bg-primary-soft transition-colors"
            >
              ปิดยอด
            </button>
          </div>
        </div>

        {/* Live validation messages */}
        {validationError && (
          <div
            className={`rounded-[14px] p-3.5 text-xs font-medium border ${
              validationError.type === "error"
                ? "bg-overdue/5 border-overdue/20 text-overdue"
                : validationError.type === "warning"
                ? "bg-debt/5 border-debt/20 text-debt"
                : "bg-primary-soft/30 border-primary-soft text-text-secondary"
            }`}
          >
            {validationError.message}
          </div>
        )}
      </section>

      {/* RESULTS DISPLAY SECTION */}
      <section className="rounded-[20px] border border-border bg-surface p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h3 className="font-extrabold text-base text-text-primary">ประมาณการผลลัพธ์จากการชำระยอดนี้</h3>
          <span className="text-xs font-semibold text-text-secondary bg-muted px-2.5 py-1 rounded-full">
            {selectedPlan === "minimum" ? "แผนขั้นต่ำ" : selectedPlan === "recommended" ? "แผนแนะนำ" : selectedPlan === "accelerated" ? "แผนเร่งปิด" : "ยอดที่ระบุเอง"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">จ่ายงวดนี้</span>
            <p className="tabular mt-1 text-xl font-extrabold text-text-primary">
              {formatTHB(activeSimulation.paymentAmountSatang)}
            </p>
          </div>

          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">ดอกเบี้ยโดยประมาณ</span>
            <p className="tabular mt-1 text-xl font-extrabold text-text-primary">
              {formatTHB(activeSimulation.interestPaidThisPaymentSatang)}
            </p>
          </div>

          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">เงินต้นที่ลดได้</span>
            <p className="tabular mt-1 text-xl font-extrabold text-income">
              {formatTHB(activeSimulation.principalPaidThisPaymentSatang)}
            </p>
          </div>

          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">ยอดคงเหลือหลังจ่าย</span>
            <p className="tabular mt-1 text-xl font-extrabold text-text-primary">
              {formatTHB(activeSimulation.balanceAfterPaymentSatang)}
            </p>
          </div>

          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">ดอกเบี้ยงวดถัดไปโดยประมาณ</span>
            <p className="tabular mt-1 text-xl font-extrabold text-text-primary">
              {formatTHB(activeSimulation.nextPeriodInterestSatang)}
            </p>
          </div>

          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">เหลืออีกประมาณ</span>
            <p className="tabular mt-1 text-xl font-extrabold text-text-primary">
              {activeSimulation.estimatedInstallmentsRemaining !== null
                ? `${activeSimulation.estimatedInstallmentsRemaining} งวด`
                : "ไม่สามารถประเมินได้"}
            </p>
          </div>

          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">คาดว่าหมดหนี้เมื่อไร</span>
            <p className="mt-1 text-xl font-extrabold text-text-primary">
              {activeSimulation.estimatedPayoffDate ?? "ไม่สามารถประเมินได้"}
            </p>
          </div>

          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">ประหยัดดอกเบี้ยเทียบขั้นต่ำ</span>
            <p className="tabular mt-1 text-xl font-extrabold text-income">
              {formatTHB(activeSimulation.interestSavedVsMinimumSatang)}
            </p>
          </div>

          <div className="p-4 rounded-[16px] bg-muted/40">
            <span className="text-xs text-text-secondary font-medium">เงินเหลือใช้เดือนนี้</span>
            <p className="tabular mt-1 text-xl font-extrabold text-text-primary">
              {activeSimulation.cashRemainingAfterPaymentSatang !== null
                ? formatTHB(activeSimulation.cashRemainingAfterPaymentSatang)
                : "ข้อมูลยังไม่พอ"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-4 text-sm">
          <span className="font-bold text-text-secondary">สถานะความพร้อมในการจ่าย</span>
          {renderAffordabilityBadge(activeSimulation.affordabilityStatus)}
        </div>

        {/* Display simulator engine internal warnings */}
        {activeSimulation.warnings.length > 0 && (
          <div className="mt-4 rounded-[14px] bg-overdue/5 border border-overdue/20 p-4 space-y-1.5 text-xs text-overdue">
            <p className="font-bold">ข้อควรระวัง:</p>
            <ul className="list-disc pl-4 space-y-1">
              {activeSimulation.warnings.map((w, idx) => (
                <li key={idx} className="leading-relaxed">{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* DETAILED WARNINGS & ASSUMPTIONS */}
      <section className="rounded-[20px] border border-border bg-surface overflow-hidden shadow-sm">
        <button
          onClick={() => setShowAssumptions(!showAssumptions)}
          className="w-full min-h-12 px-5 flex items-center justify-between font-bold text-sm text-text-primary hover:bg-muted/50 transition-colors"
          aria-expanded={showAssumptions}
        >
          <span className="flex items-center gap-2">
            ℹ️ สมมติฐานและคำชี้แจงในการคำนวณ {showAssumptions ? "(ปิด)" : "(ขยาย)"}
          </span>
          <span>{showAssumptions ? "▲" : "▼"}</span>
        </button>

        {showAssumptions && (
          <div className="p-5 border-t border-border bg-muted/30 space-y-4 text-xs text-text-secondary leading-relaxed">
            <div className="space-y-1.5">
              <p className="font-bold text-text-primary">สมมติฐานการคำนวณ:</p>
              <ul className="list-decimal pl-4 space-y-1">
                {activeSimulation.assumptions.map((asm, idx) => (
                  <li key={idx}>{asm}</li>
                ))}
                {SIMULATOR_ASSUMPTIONS.map((asm, idx) => (
                  <li key={`static-${idx}`}>{asm}</li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border/60 pt-3 space-y-1.5">
              <p className="font-bold text-text-primary">คำชี้แจงด้านความเสี่ยงการจัดสรรเงินส่วนเกิน:</p>
              <p>{LENDER_RISK_WARNING}</p>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
