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
import {
  getMonthlyBudget,
  listAllTransactions,
  listBudgetCategories,
  listDebts,
} from "@/lib/data/finance-repository";
import { buildBudgetSummary } from "@/lib/finance/budget-calculations";
import { calculateMonthlyTotals, calculateHistoricalInsights, remainingToMinimum } from "@/lib/finance/calculations";
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
    const [, allTransactions, debts, monthlyBudget] = await Promise.all([
      requireCompletedOnboarding(user),
      listAllTransactions(user.id),
      listDebts(user.id),
      getMonthlyBudget(user.id, month),
    ]);
    const transactions = allTransactions.filter((transaction) => transaction.occurredAt.startsWith(month));
    const totals = calculateMonthlyTotals(transactions, month);
    const insights = calculateHistoricalInsights(allTransactions);
    const categories = transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce<Record<string, number>>((acc, transaction) => {
        const key = transaction.category ?? "อื่น ๆ";
        acc[key] = (acc[key] ?? 0) + transaction.amountSatang;
        return acc;
      }, {});

    const budgetCategories = monthlyBudget ? await listBudgetCategories(user.id, monthlyBudget.id) : [];
    const budgetSummary = buildBudgetSummary(month, monthlyBudget, budgetCategories, transactions);

    const totalOutstanding = debts.reduce((sum, debt) => sum + (debt.outstandingBalanceSatang ?? 0), 0);
    const totalMinimumDue = debts.reduce((sum, debt) => sum + remainingToMinimum(debt), 0);

    return (
      <AppShell>
        <PageHeader title="ภาพรวม" subtitle="เดือนนี้" />
        <FinancialHero
          label="เหลือใช้จริงเดือนนี้"
          amountSatang={totals.cashRemainingSatang}
          budgetLabel={`จากรายรับ ${formatTHB(totals.incomeSatang)}`}
        />

        <section className="rounded-[16px] border border-border bg-surface px-5 py-2" aria-label="รายรับและรายจ่าย">
          <MoneyFlowRow label="รายรับ" amountSatang={totals.incomeSatang} direction="in" />
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
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-text-secondary">ใช้ไป {formatTHB(budgetSummary.spentTotalSatang)} จาก {formatTHB(budgetSummary.plannedTotalSatang)}</p>
                <p
                  className={`tabular mt-1 text-lg font-bold ${budgetSummary.remainingTotalSatang < 0 ? "text-overdue" : "text-foreground"}`}
                >
                  เหลืองบ {formatTHB(budgetSummary.remainingTotalSatang)}
                </p>
              </div>
              <BudgetStatusBadge status={budgetSummary.status} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">ยังไม่ได้ตั้งงบเดือนนี้</p>
          )}
        </section>

        <section className="rounded-[16px] border border-border bg-surface p-4" aria-label="ภาระหนี้">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">ภาระหนี้</h2>
            <Link href="/debts" className="text-sm font-bold text-primary">
              ดูรายการหนี้
            </Link>
          </div>
          {debts.length ? (
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
          ) : (
            <p className="mt-2 text-sm text-text-secondary">ไม่มีหนี้ที่ต้องติดตาม</p>
          )}
        </section>

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

        {Object.keys(categories).length ? (
          <section className="rounded-[16px] border border-border bg-surface p-4" aria-label="หมวดที่ใช้จริง">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">หมวดที่ใช้จริง</h2>
              <Link href="/transactions" className="text-sm font-bold text-primary">
                ดูรายการทั้งหมด
              </Link>
            </div>
            <div className="mt-2 divide-y divide-border/70">
              {Object.entries(categories)
                .filter(([, amount]) => amount !== 0)
                .map(([category, amount]) => (
                  <div key={category} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium text-text-secondary">{category}</span>
                    <span className="tabular font-bold">{formatTHB(amount)}</span>
                  </div>
                ))}
            </div>
          </section>
        ) : (
          <EmptyState title="ข้อมูลยังไม่พอ" body="เริ่มจากเพิ่มรายรับหรือรายจ่ายอย่างน้อย 1 รายการ" />
        )}
      </AppShell>
    );
  });
}
