import { AppShell } from "@/components/AppShell";
import { FinancialHero } from "@/components/FinancialHero";
import { NextActionCard } from "@/components/NextActionCard";
import { PageHeader } from "@/components/PageHeader";
import { TransactionGroup } from "@/components/TransactionGroup";
import { EmptyState } from "@/components/EmptyState";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listDebts, listTransactions } from "@/lib/data/finance-repository";
import { remainingToMinimum } from "@/lib/finance/calculations";
import { formatTHB } from "@/lib/finance/money";

export default async function TodayPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const month = today.toISOString().slice(0, 7);
  const [transactions, debts] = await Promise.all([
    listTransactions(user.id, month),
    listDebts(user.id),
  ]);
  const todayTransactions = transactions.filter((transaction) =>
    transaction.occurredAt.startsWith(todayKey),
  );
  const spentToday = todayTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amountSatang, 0);
  const incomeToday = todayTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amountSatang, 0);
  const debtPaidToday = todayTransactions
    .filter((transaction) => transaction.type === "debt_payment")
    .reduce((sum, transaction) => sum + transaction.amountSatang, 0);
  const nextDebt = debts[0];

  return (
    <AppShell>
      <PageHeader title="วันนี้" subtitle="ดูเงินวันนี้แบบไม่ต้องคิดเยอะ" />
      <FinancialHero
        label="วันนี้ใช้ไป"
        amountSatang={spentToday}
        budgetLabel="ยังไม่ได้ตั้งงบวันนี้"
        stats={[
          { label: "รายรับ", amountSatang: incomeToday, tone: "income" },
          { label: "จ่ายหนี้", amountSatang: debtPaidToday, tone: "debt" },
        ]}
      />
      <NextActionCard title="ยังไม่ได้ตั้งงบวันนี้" body="ตั้งงบรายเดือนเพื่อเห็นกรอบใช้เงินรายวัน" action="ตั้งงบเดือนนี้" />
      {nextDebt ? (
        <NextActionCard
          title={`${nextDebt.name} ยังขาดขั้นต่ำ ${formatTHB(remainingToMinimum(nextDebt))}`}
          body="กันเงินให้ครบขั้นต่ำก่อนวันครบกำหนด"
          action="ดูแผนหนี้"
        />
      ) : (
        <NextActionCard title="เริ่มจากบันทึกรายการแรก" body="เพิ่มรายรับ รายจ่าย หรือหนี้ที่อยากให้ช่วยเตือน" />
      )}
      {todayTransactions.length ? (
        <TransactionGroup date={todayKey} transactions={todayTransactions} />
      ) : (
        <EmptyState title="วันนี้ยังไม่มีรายการ" body="เพิ่มเองหรืออัปโหลดสลิปแรกของวันนี้" />
      )}
    </AppShell>
  );
}
