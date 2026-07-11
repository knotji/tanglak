import { MoneyAmount } from "@/components/MoneyAmount";
import { IncomeExpenseIndicator } from "./IncomeExpenseIndicator";

export function CashFlowSummary({
  incomeSatang,
  expenseSatang,
  debtPaymentSatang = 0,
  label = "สรุปกระแสเงิน",
}: {
  incomeSatang: number;
  expenseSatang: number;
  debtPaymentSatang?: number;
  label?: string;
}) {
  const net = incomeSatang - expenseSatang - debtPaymentSatang;

  return (
    <section className="rounded-lg border border-border bg-surface p-4" aria-label={label}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <MoneyAmount satang={net} tone={net >= 0 ? "income" : "expense"} showSign className="mt-1 block text-3xl font-bold" />
        </div>
        <IncomeExpenseIndicator type={net >= 0 ? "income" : "expense"} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-text-secondary">รายรับ</dt>
          <dd><MoneyAmount satang={incomeSatang} tone="income" /></dd>
        </div>
        <div>
          <dt className="text-text-secondary">รายจ่าย</dt>
          <dd><MoneyAmount satang={expenseSatang} tone="expense" /></dd>
        </div>
        <div>
          <dt className="text-text-secondary">หนี้</dt>
          <dd><MoneyAmount satang={debtPaymentSatang} tone="expense" /></dd>
        </div>
      </dl>
    </section>
  );
}
