"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { buildDebtPortfolioComparison, type DebtStrategy } from "@/lib/debt/portfolio-strategy";
import { formatTHB } from "@/lib/finance/money";
import { parseOptionalMoney } from "@/lib/finance/money-guards";
import {
  portfolioStrategyLabel,
  recommendFocusDebt,
} from "@/lib/finance/portfolio-recommendation";
import type { Debt } from "@/types/domain";

type StrategyClientProps = {
  debts: Debt[];
};

const STRATEGY_COPY: Record<DebtStrategy, { label: string; description: string }> = {
  snowball: {
    label: "ปิดก้อนเล็กก่อน",
    description: "เริ่มจากหนี้ยอดคงเหลือน้อยที่สุด เพื่อให้ปิดก้อนได้เร็ว",
  },
  avalanche: {
    label: "ลดดอกเบี้ยก่อน",
    description: "เริ่มจากหนี้ดอกเบี้ยสูงที่สุด เพื่อลดดอกเบี้ยรวม",
  },
};

function debtLabel(debts: Debt[], debtId: string | null): string {
  if (!debtId) return "ยังไม่มีหนี้ที่แนะนำ";
  return debts.find((debt) => debt.id === debtId)?.name ?? "หนี้ที่เลือก";
}

function rateLabel(debt: Debt): string {
  return debt.interestRateAnnual === undefined ? "ไม่ระบุ" : `${debt.interestRateAnnual}% ต่อปี`;
}

export function StrategyClient({ debts }: StrategyClientProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<DebtStrategy>("snowball");
  const [extraBudget, setExtraBudget] = useState("0");

  const parsedExtraBudget = useMemo(() => {
    const result = parseOptionalMoney(extraBudget, "nonnegative");
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, satang: result.satang ?? 0 };
  }, [extraBudget]);

  const comparison = useMemo(() => {
    if (!parsedExtraBudget.ok) return null;
    return buildDebtPortfolioComparison(debts, parsedExtraBudget.satang);
  }, [debts, parsedExtraBudget]);

  const recommendation = comparison ? recommendFocusDebt(comparison) : null;
  const selectedResult = comparison?.[selectedStrategy];
  const focusDebtId = selectedResult?.focusDebtId ?? null;
  const focusDebtName = debtLabel(debts, focusDebtId);
  const orderedDebts = selectedResult?.orderedDebtIds
    .map((debtId) => debts.find((debt) => debt.id === debtId))
    .filter((debt): debt is Debt => Boolean(debt)) ?? [];

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="วางแผนปิดหนี้" subtitle="เปรียบเทียบลำดับปิดหนี้แบบอ่านอย่างเดียว" />
        <Link href="/debts" className="min-h-11 shrink-0 rounded-[16px] bg-muted px-4 py-3 text-sm font-bold text-primary">
          หนี้
        </Link>
      </div>

      {debts.length < 2 ? (
        <div className="rounded-[16px] border border-border bg-surface p-5">
          <p className="text-sm font-bold text-primary">ยังเปรียบเทียบกลยุทธ์ไม่ได้</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">ต้องมีหนี้ที่ยังไม่ปิดอย่างน้อย 2 ก้อน</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            เพิ่มหรือเปิดดูหนี้ที่ยังต้องจัดการก่อน แล้วค่อยกลับมาเทียบ Snowball กับ Avalanche
          </p>
          <Link
            href="/debts"
            className="mt-4 flex min-h-11 items-center justify-center rounded-[16px] bg-primary px-4 text-sm font-bold text-white"
          >
            กลับไปหน้าหนี้
          </Link>
        </div>
      ) : (
        <>
          <section className="rounded-[16px] border border-border bg-surface p-5" aria-labelledby="strategy-mode-heading">
            <h2 id="strategy-mode-heading" className="text-sm font-bold text-foreground">
              เลือกวิธีเรียงลำดับ
            </h2>
            <div role="radiogroup" aria-labelledby="strategy-mode-heading" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["snowball", "avalanche"] as const).map((strategy) => {
                const selected = selectedStrategy === strategy;
                return (
                  <button
                    key={strategy}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedStrategy(strategy)}
                    className={`min-h-24 rounded-[16px] border p-4 text-left transition ${
                      selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className="block text-base font-bold">{STRATEGY_COPY[strategy].label}</span>
                    <span className="mt-1 block text-sm leading-6 text-text-secondary">{STRATEGY_COPY[strategy].description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[16px] border border-border bg-surface p-5" aria-labelledby="extra-budget-label">
            <label id="extra-budget-label" htmlFor="extra-budget" className="text-sm font-bold text-foreground">
              งบโปะเพิ่มต่อเดือน
            </label>
            <input
              id="extra-budget"
              inputMode="decimal"
              value={extraBudget}
              onChange={(event) => setExtraBudget(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-[16px] border border-border bg-white px-3 text-base font-bold text-primary"
              aria-describedby="extra-budget-status"
            />
            <p id="extra-budget-status" aria-live="polite" className="mt-2 text-sm leading-6 text-text-secondary">
              {parsedExtraBudget.ok
                ? `คำนวณด้วยเงินโปะเพิ่ม ${formatTHB(parsedExtraBudget.satang)} ต่อเดือน`
                : parsedExtraBudget.error}
            </p>
            {!parsedExtraBudget.ok ? (
              <p role="alert" className="mt-2 text-sm font-bold text-overdue">
                {parsedExtraBudget.error}
              </p>
            ) : null}
          </section>

          {comparison && recommendation ? (
            <section className="rounded-[16px] border border-primary/20 bg-primary-soft/40 p-5" aria-label="คำแนะนำ">
              <p className="text-sm font-bold text-primary">คำแนะนำ</p>
              <h2 className="mt-1 text-2xl font-bold text-foreground">{focusDebtName}</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{recommendation.reason}</p>
              {recommendation.estimatedInterestSavingSatang > 0 ? (
                <p className="mt-3 text-sm font-bold text-primary">
                  คาดว่าส่วนต่างดอกเบี้ยประมาณ {formatTHB(recommendation.estimatedInterestSavingSatang)}
                </p>
              ) : null}
            </section>
          ) : null}

          {comparison && selectedResult ? (
            <>
              <section className="rounded-[16px] border border-border bg-surface p-5" aria-label="เปรียบเทียบดอกเบี้ยรวม">
                <p className="text-sm font-bold text-foreground">เปรียบเทียบดอกเบี้ยรวมโดยประมาณ</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold text-text-secondary">ปิดก้อนเล็กก่อน</p>
                    <p className="tabular mt-1 text-xl font-bold">{formatTHB(comparison.snowball.totalEstimatedRemainingInterestSatang)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-secondary">ลดดอกเบี้ยก่อน</p>
                    <p className="tabular mt-1 text-xl font-bold">{formatTHB(comparison.avalanche.totalEstimatedRemainingInterestSatang)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-secondary">ความต่างที่คาดว่า</p>
                    <p className="tabular mt-1 text-xl font-bold">{formatTHB(Math.abs(comparison.interestDifferenceSatang))}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[16px] border border-border bg-surface p-5" aria-label="ลำดับหนี้">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">ลำดับหนี้</p>
                    <p className="mt-1 text-xs text-text-secondary">{portfolioStrategyLabel(selectedStrategy)}</p>
                  </div>
                  <p className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-text-secondary">
                    {orderedDebts.length} ก้อน
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {orderedDebts.map((debt, index) => {
                    const focused = debt.id === focusDebtId;
                    return (
                      <article key={debt.id} className="rounded-[16px] border border-border bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-text-secondary">#{index + 1}</p>
                            <h3 className="mt-1 truncate text-base font-bold text-foreground">{debt.name}</h3>
                          </div>
                          {focused ? (
                            <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                              ก้อนที่โฟกัส
                            </span>
                          ) : null}
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-xs text-text-secondary">ยอดคงเหลือ</dt>
                            <dd className="tabular mt-1 font-bold">{formatTHB(debt.outstandingBalanceSatang ?? 0)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-text-secondary">ดอกเบี้ย</dt>
                            <dd className="mt-1 font-bold">{rateLabel(debt)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-text-secondary">ขั้นต่ำ</dt>
                            <dd className="tabular mt-1 font-bold">{formatTHB(debt.minimumPaymentSatang ?? 0)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-text-secondary">จ่ายในแผนนี้</dt>
                            <dd className="tabular mt-1 font-bold">
                              {formatTHB(selectedResult.simulations.find((item) => item.debtId === debt.id)?.monthlyPaymentSatang ?? 0)}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
