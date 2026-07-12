import { MoneyAmount } from "@/components/MoneyAmount";
import { TransactionRow } from "@/components/TransactionRow";
import type { Transaction } from "@/types/domain";
import { getBangkokTodayString } from "@/lib/finance/date";

function dayLabel(date: string) {
  const value = new Date(date);
  const formatted = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
  }).format(value);
  const todayStr = getBangkokTodayString();
  return date.startsWith(todayStr) ? `วันนี้ · ${formatted}` : formatted;
}

export function TransactionGroup({
  date,
  transactions,
  onEdit,
  onDelete,
  busyId,
}: {
  date: string;
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  busyId?: string | null;
}) {
  const total = transactions.reduce((sum, transaction) => {
    if (transaction.type === "income" || transaction.type === "refund") {
      return sum + transaction.amountSatang;
    }
    if (transaction.type === "transfer") return sum;
    return sum - transaction.amountSatang;
  }, 0);

  return (
    <section className="rounded-[16px] border border-border bg-surface px-4 py-2">
      <div className="flex items-center justify-between border-b border-border/70 py-3">
        <h2 className="text-sm font-bold">{dayLabel(date)}</h2>
        {/* Green is not applied merely because the day's net total is
            positive -- see MoneyFlowRow.tsx for the underlying principle. */}
        <MoneyAmount satang={total} tone={total < 0 ? "expense" : "neutral"} showSign={total >= 0} className="text-sm font-bold" />
      </div>
      <div className="divide-y divide-border/60">
        {transactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            onEdit={onEdit}
            onDelete={onDelete}
            busy={busyId === transaction.id}
          />
        ))}
      </div>
    </section>
  );
}
