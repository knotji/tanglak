import { MoneyAmount } from "@/components/MoneyAmount";
import type { Transaction } from "@/types/domain";

export function TransactionTimeline({
  transactions,
}: {
  transactions: Transaction[];
}) {
  if (transactions.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-surface p-5 text-sm text-foreground/70">
        <p className="font-medium text-foreground">วันนี้ยังไม่มีรายการ</p>
        <p className="mt-1">เพิ่มเองหรืออัปโหลดสลิปแรกของวันนี้</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
        >
          <div>
            <p className="text-sm text-foreground/50">
              {new Intl.DateTimeFormat("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(transaction.occurredAt))}
            </p>
            <p className="font-medium text-foreground">
              {transaction.merchant ?? transaction.note ?? "รายการ"}
            </p>
            {transaction.type === "debt_payment" ? (
              <p className="text-xs text-debt">ชำระหนี้</p>
            ) : null}
          </div>
          <MoneyAmount
            satang={transaction.amountSatang}
            className={
              transaction.type === "income"
                ? "font-semibold text-primary"
                : "font-semibold"
            }
          />
        </div>
      ))}
    </section>
  );
}
