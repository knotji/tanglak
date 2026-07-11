import { CategoryIcon } from "@/components/CategoryIcon";
import { MoneyAmount } from "@/components/MoneyAmount";
import type { Transaction, TransactionType } from "@/types/domain";
import { IncomeExpenseIndicator } from "./IncomeExpenseIndicator";

function transactionTone(type: TransactionType) {
  return type === "income" || type === "refund" ? "income" : type === "transfer" ? "neutral" : "expense";
}

function shouldShowSign(type: TransactionType) {
  return type === "income" || type === "refund";
}

export function CompactTransactionRow({
  transaction,
  actionLabel = "เปิดรายละเอียด",
  onAction,
}: {
  transaction: Transaction;
  actionLabel?: string;
  onAction?: (transaction: Transaction) => void;
}) {
  const description = transaction.merchant ?? transaction.note ?? "รายการ";
  const dateTime = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(transaction.occurredAt));

  return (
    <article className="flex max-w-full items-center gap-3 overflow-hidden border-b border-border py-3 last:border-b-0">
      <CategoryIcon category={transaction.category} type={transaction.type} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-bold text-foreground">{description}</h3>
          {transaction.isHistorical || transaction.importBatchId ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-text-secondary">นำเข้า</span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-text-secondary">
          {transaction.category ?? "ไม่ระบุหมวด"} · {dateTime}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <MoneyAmount
          satang={transaction.amountSatang}
          tone={transactionTone(transaction.type)}
          showSign={shouldShowSign(transaction.type)}
          className="block text-sm font-bold"
        />
        <IncomeExpenseIndicator type={transaction.type} showLabel={false} />
      </div>
      {onAction ? (
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-md bg-muted px-3 text-xs font-bold text-primary"
          aria-label={`${actionLabel} ${description}`}
          onClick={() => onAction(transaction)}
        >
          ดู
        </button>
      ) : null}
    </article>
  );
}
