import { AppShell } from "@/components/AppShell";
import { CompactStat } from "@/components/CompactStat";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { NextActionCard } from "@/components/NextActionCard";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { MoneyAmount } from "@/components/MoneyAmount";
import { CompactTransactionRow } from "@/components/finance/CompactTransactionRow";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import {
  getMonthlyBudget,
  listBudgetCategories,
  listDebts,
  listTransactions,
} from "@/lib/data/finance-repository";
import { buildBudgetSummary } from "@/lib/finance/budget-calculations";
import { determineNextAction } from "@/lib/finance/next-action";
import { timePage } from "@/lib/observability/timing";
import { getBangkokTodayString, getBangkokMonthString } from "@/lib/finance/date";

function formatTodayHeading(todayKey: string) {
  const date = new Date(`${todayKey}T00:00:00+07:00`);
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export default async function TodayPage() {
  return timePage("/today", async () => {
    const user = await requireUser();
    const todayKey = getBangkokTodayString();
    const month = getBangkokMonthString();
    const [, transactions, debts, monthlyBudget] = await Promise.all([
      requireCompletedOnboarding(user),
      listTransactions(user.id, month),
      listDebts(user.id),
      getMonthlyBudget(user.id, month),
    ]);
    const categories = monthlyBudget ? await listBudgetCategories(user.id, monthlyBudget.id) : [];
    const budgetSummary = buildBudgetSummary(month, monthlyBudget, categories, transactions);

    const todayTransactions = transactions
      .filter((transaction) => transaction.occurredAt.startsWith(todayKey))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const spentToday = todayTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amountSatang, 0);
    const monthlySpent = budgetSummary.spentTotalSatang;
    const overspentCategory = budgetSummary.categories.find((c) => c.status === "overspent");
    const unbudgetedCategory = budgetSummary.categories.find(
      (c) => c.status === "no_budget" && c.unbudgetedSpentSatang > 0,
    );
    const nearLimitCategory = budgetSummary.categories.find((c) => c.status === "near_limit");

    const nextAction = determineNextAction({
      debts,
      hasBudget: budgetSummary.hasBudget,
      overspentCategoryLabel: overspentCategory?.label,
      unbudgetedCategoryLabel: unbudgetedCategory?.label,
      nearLimitCategoryLabel: nearLimitCategory?.label,
      hasAnyTransaction: transactions.length > 0,
    });

    return (
      <AppShell>
        <PageHeader title="วันนี้" subtitle={formatTodayHeading(todayKey)} />

        <section className="rounded-[16px] border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-text-secondary">วันนี้ใช้ไป</p>
          {spentToday > 0 ? (
            <MoneyAmount
              satang={spentToday}
              tone="expense"
              className="mt-2 block text-[40px] font-bold leading-none text-foreground"
            />
          ) : (
            <p className="mt-2 text-lg font-bold leading-snug text-text-secondary">ยังไม่มีรายจ่ายวันนี้</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactStat label="เดือนนี้ใช้ไป" amountSatang={monthlySpent} />
            <CompactStat
              label="งบที่เหลือ"
              amountSatang={budgetSummary.hasBudget ? budgetSummary.remainingTotalSatang : 0}
              tone={budgetSummary.remainingTotalSatang < 0 ? "debt" : "income"}
            />
          </div>
        </section>

        <NextActionCard {...nextAction} />

        <section aria-label="รายการล่าสุด" className="rounded-[16px] border border-border bg-surface px-4 py-1">
          <h2 className="py-3 text-sm font-bold text-foreground">รายการวันนี้</h2>
          {todayTransactions.length ? (
            <div>
              {todayTransactions.map((transaction) => (
                <CompactTransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </div>
          ) : (
            <div className="pb-4">
              <EmptyState title="วันนี้ยังไม่มีรายการ" body="เพิ่มเองหรืออัปโหลดสลิปแรกของวันนี้" />
            </div>
          )}
        </section>

        <FloatingActionButton label="สแกน/อัปโหลด" href="/upload" />
      </AppShell>
    );
  });
}
