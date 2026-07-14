import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { FinancialHero } from "@/components/FinancialHero";
import { MoneyFlowRow } from "@/components/MoneyFlowRow";
import { MoneyAmount } from "@/components/MoneyAmount";
import { PageHeader } from "@/components/PageHeader";
import { BudgetStatusBadge } from "@/components/finance/BudgetStatusBadge";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { listAllTransactions, listDebts } from "@/lib/data/finance-repository";
import { getMonthlyFinanceSnapshot } from "@/lib/finance/monthly-snapshot";
import { calculateCashRemaining, calculateHistoricalInsights, remainingToMinimum } from "@/lib/finance/calculations";
import { formatTHB } from "@/lib/finance/money";
import { timePage } from "@/lib/observability/timing";
import { getBangkokMonthString } from "@/lib/finance/date";

const INSIGHT_TONE: Record<string, string> = {
  success: "border-income/20 bg-income/5 text-income",
  info: "border-primary/15 bg-primary-soft text-primary",
  warning: "border-debt/25 bg-debt/5 text-debt",
};

export default async function OverviewPage() {
  return timePage("/overview", async () => {
    const user = await requireUser();
    const month = getBangkokMonthString();
    // listAllTransactions is only for calculateHistoricalInsights (a
    // genuinely multi-month feature); every other figure on this page comes
    // from the one canonical month-scoped snapshot (see
    // src/lib/finance/monthly-snapshot.ts) -- this page used to fetch
    // listAllTransactions and filter client-side with a naive
    // `occurredAt.startsWith(month)` check, which silently undercounted
    // transactions near the Bangkok midnight boundary since Supabase
    // returns occurredAt in UTC. Independent queries run in parallel.
    const [, allTransactions, debts, snapshot] = await Promise.all([
      requireCompletedOnboarding(user),
      listAllTransactions(user.id),
      listDebts(user.id),
      getMonthlyFinanceSnapshot(user.id, month),
    ]);
    const { totals, budgetSummary } = snapshot;
    const insights = calculateHistoricalInsights(allTransactions);
    // Reuses the same canonical, legacy-normalized, deduplicated category
    // spend already computed for the budget section above -- this page
    // used to independently re-derive its own category breakdown from raw
    // transactions (expense-only, no legacy-label normalization), which
    // could show a different total/category set than Budget and Today for
    // the same month (Issue 1: "do not let individual pages independently
    // reimplement filters").
    const categoriesWithSpend = budgetSummary.categories.filter((category) => category.spentSatang > 0);

    // Canonical saved monthly income (same source as the Budget page) --
    // never the sum of actual income-type transactions, which is a
    // different concept. See calculateCashRemaining in calculations.ts.
    const plannedIncomeSatang = budgetSummary.expectedIncomeSatang;
    const cashRemainingSatang = calculateCashRemaining(plannedIncomeSatang, totals);

    const totalOutstanding = debts.reduce((sum, debt) => sum + (debt.outstandingBalanceSatang ?? 0), 0);
    const totalMinimumDue = debts.reduce((sum, debt) => sum + remainingToMinimum(debt), 0);

    return (
      <AppShell>
        <PageHeader title="ภาพรวม" subtitle="เดือนนี้" />
        <FinancialHero
          label="เหลือใช้จริงเดือนนี้"
          amountSatang={cashRemainingSatang}
          budgetLabel={`จากรายรับ ${formatTHB(plannedIncomeSatang)}`}
        />

        <section className="rounded-[16px] border border-border bg-surface px-5 py-2" aria-label="รายรับและรายจ่าย">
          <MoneyFlowRow label="รายรับ" amountSatang={plannedIncomeSatang} direction="in" />
          <MoneyFlowRow label="ค่าใช้ชีวิต" amountSatang={totals.livingExpenseSatang} direction="out" />
          <MoneyFlowRow label="จ่ายหนี้" amountSatang={totals.debtPaymentSatang} direction="out" />
          {totals.refundSatang > 0 ? <MoneyFlowRow label="เงินคืน" amountSatang={totals.refundSatang} direction="in" /> : null}
        </section>

        <section className="rounded-[16px] border border-border bg-surface p-4" aria-label="สถานะงบประมาณ">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">สถานะงบประมาณ</h2>
            <Link href="/budget" className="text-sm font-bold text-primary">
              ดูงบประมาณ
            </Link>
          </div>
          {budgetSummary.hasBudget ? (
            <>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-secondary">ใช้ไป {formatTHB(budgetSummary.spentTotalSatang)} จาก {formatTHB(budgetSummary.plannedTotalSatang)}</p>
                  {budgetSummary.plannedTotalSatang > 0 ? (
                    // Only meaningful against a real, positive allocation --
                    // never a negative figure that's really just "no
                    // category budget was ever set" (Issue 2).
                    <p
                      className={`tabular mt-1 text-lg font-bold ${budgetSummary.remainingTotalSatang < 0 ? "text-overdue" : "text-foreground"}`}
                    >
                      เหลืองบ {formatTHB(budgetSummary.remainingTotalSatang)}
                    </p>
                  ) : (
                    <p className="mt-1 text-lg font-bold text-text-secondary">ยังไม่ได้ตั้งงบ</p>
                  )}
                </div>
                <BudgetStatusBadge status={budgetSummary.status} />
              </div>
              {budgetSummary.overspentTotalSatang > 0 ? (
                <p className="mt-2 text-xs font-bold text-overdue">เกินงบรวม {formatTHB(budgetSummary.overspentTotalSatang)}</p>
              ) : null}
              {budgetSummary.unbudgetedSpentTotalSatang > 0 ? (
                <p className="mt-1 text-xs text-text-secondary">
                  รายจ่ายในหมวดที่ยังไม่ได้ตั้งงบ {formatTHB(budgetSummary.unbudgetedSpentTotalSatang)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">ยังไม่ได้ตั้งงบเดือนนี้</p>
          )}
        </section>

        {categoriesWithSpend.length ? (
          <section className="rounded-[16px] border border-border bg-surface p-4" aria-label="หมวดที่ใช้จริง">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">หมวดที่ใช้จริง</h2>
              <Link href="/transactions" className="text-sm font-bold text-primary">
                ดูรายการทั้งหมด
              </Link>
            </div>
            <div className="mt-2 divide-y divide-border/70">
              {categoriesWithSpend.map((category) => (
                <div key={category.label} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium text-text-secondary">{category.label}</span>
                  <span className="tabular font-bold">{formatTHB(category.spentSatang)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState title="ข้อมูลยังไม่พอ" body="เริ่มจากเพิ่มรายรับหรือรายจ่ายอย่างน้อย 1 รายการ" />
        )}

        {insights.length > 0 && (
          <section className="rounded-[16px] border border-border bg-surface p-4 flex flex-col gap-3" aria-label="การเปลี่ยนแปลงที่น่าสนใจ">
            <h2 className="text-sm font-bold text-foreground">การเปลี่ยนแปลงที่น่าสนใจ</h2>
            <div className="flex flex-col gap-2">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className={`rounded-xl border p-3 text-xs leading-5 ${INSIGHT_TONE[insight.type] ?? INSIGHT_TONE.info}`}
                >
                  {insight.message}
                </div>
              ))}
            </div>
          </section>
        )}

        {debts.length > 0 && (
          <section className="rounded-[16px] border border-border bg-surface p-4" aria-label="ภาระหนี้">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">ภาระหนี้</h2>
              <Link href="/debts" className="text-sm font-bold text-primary">
                ดูรายการหนี้
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-secondary">ยอดคงเหลือรวม</p>
                <MoneyAmount satang={totalOutstanding} className="mt-1 block text-lg font-bold" />
              </div>
              <div>
                <p className="text-text-secondary">ขั้นต่ำที่ยังขาด</p>
                <MoneyAmount
                  satang={totalMinimumDue}
                  className={`mt-1 block text-lg font-bold ${totalMinimumDue > 0 ? "text-debt" : ""}`}
                />
              </div>
            </div>
          </section>
        )}
      </AppShell>
    );
  });
}
