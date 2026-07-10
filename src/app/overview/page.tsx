import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { FinancialHero } from "@/components/FinancialHero";
import { MoneyFlowRow } from "@/components/MoneyFlowRow";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { listTransactions, listAllTransactions } from "@/lib/data/finance-repository";
import { calculateMonthlyTotals, calculateHistoricalInsights } from "@/lib/finance/calculations";
import { formatTHB } from "@/lib/finance/money";

export default async function OverviewPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const month = new Date().toISOString().slice(0, 7);
  const [transactions, allTransactions] = await Promise.all([
    listTransactions(user.id, month),
    listAllTransactions(user.id),
  ]);
  const totals = calculateMonthlyTotals(transactions, month);
  const insights = calculateHistoricalInsights(allTransactions);
  const categories = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce<Record<string, number>>((acc, transaction) => {
      const key = transaction.category ?? "อื่น ๆ";
      acc[key] = (acc[key] ?? 0) + transaction.amountSatang;
      return acc;
    }, {});

  return (
    <AppShell>
      <PageHeader title="ภาพรวม" subtitle="เดือนนี้" />
      <FinancialHero
        label="เหลือใช้จริงเดือนนี้"
        amountSatang={totals.cashRemainingSatang}
        budgetLabel={`จากรายรับ ${formatTHB(totals.incomeSatang)}`}
      />
      <section className="rounded-[16px] border border-border bg-surface px-5 py-2 shadow-[0_10px_24px_rgba(24,32,29,0.04)]">
        <MoneyFlowRow label="รายรับ" amountSatang={totals.incomeSatang} direction="in" />
        <MoneyFlowRow label="ค่าใช้ชีวิต" amountSatang={totals.livingExpenseSatang} direction="out" />
        <MoneyFlowRow label="จ่ายหนี้" amountSatang={totals.debtPaymentSatang} direction="out" />
      </section>

      {insights.length > 0 && (
        <section className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_10px_24px_rgba(24,32,29,0.04)] flex flex-col gap-3">
          <h2 className="font-bold">วิเคราะห์ข้อมูลย้อนหลัง</h2>
          <div className="flex flex-col gap-2">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`rounded-xl border p-3 text-xs leading-5 ${
                  insight.type === "success"
                    ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                    : "border-blue-100 bg-blue-50 text-blue-800"
                }`}
              >
                {insight.message}
              </div>
            ))}
          </div>
        </section>
      )}

      {Object.keys(categories).length ? (
        <section className="rounded-[16px] border border-border bg-surface p-5 shadow-[0_10px_24px_rgba(24,32,29,0.04)]">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">หมวดที่ใช้จริง</h2>
            <Link href="/transactions" className="text-sm font-bold text-primary">
              ดูรายการทั้งหมด
            </Link>
          </div>
          <div className="mt-3 divide-y divide-border/70">
            {Object.entries(categories).map(([category, amount]) => (
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
}
