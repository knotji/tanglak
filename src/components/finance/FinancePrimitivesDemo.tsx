import {
  BudgetProgress,
  CashFlowSummary,
  CategoryBudgetRow,
  CompactTransactionRow,
  FinancialAlert,
  FinancialEmptyState,
  FinancialMetricCard,
  FinancialSkeleton,
  MonthSelector,
} from "@/components/finance";
import type { Transaction } from "@/types/domain";

const demoTransaction: Transaction = {
  id: "demo-tx",
  userId: "demo-user",
  type: "expense",
  status: "confirmed",
  amountSatang: 129900,
  currency: "THB",
  occurredAt: "2026-05-15T18:30:00+07:00",
  merchant: "Demo Market",
  category: "อาหาร",
  source: "history_import",
  importBatchId: "demo-batch",
  isHistorical: true,
};

export function FinancePrimitivesDemo() {
  return (
    <div className="space-y-4">
      <CashFlowSummary incomeSatang={6500000} expenseSatang={2380000} debtPaymentSatang={850000} />
      <FinancialMetricCard label="ใช้จ่ายเดือนนี้" amountSatang={2380000} tone="expense" comparison="เพิ่มขึ้นจากเดือนก่อน" trend="up" warning />
      <BudgetProgress label="งบอาหาร" spentSatang={129900} budgetSatang={200000} />
      <CategoryBudgetRow category="เดินทาง" spentSatang={220000} budgetSatang={200000} />
      <MonthSelector value="2026-05" currentMonth="2026-07" onMonthChange={() => undefined} />
      <CompactTransactionRow transaction={demoTransaction} />
      <FinancialAlert title="ใกล้ถึงงบ" tone="warning">ตรวจดูหมวดที่ใช้จ่ายเร็วผิดปกติ</FinancialAlert>
      <FinancialEmptyState title="ยังไม่มีข้อมูลงบ" body="เริ่มจากตั้งงบหมวดหลักเพื่อดูสถานะรายเดือน" />
      <FinancialSkeleton rows={2} />
    </div>
  );
}
