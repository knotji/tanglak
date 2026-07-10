import { MoneyAmount } from "@/components/MoneyAmount";

export function MoneyFlowRow({
  label,
  amountSatang,
  direction,
}: {
  label: string;
  amountSatang: number;
  direction: "in" | "out";
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <span className={`text-base font-bold ${direction === "in" ? "text-income" : "text-expense"}`}>
        {direction === "in" ? "+" : "-"}
        <MoneyAmount satang={amountSatang} />
      </span>
    </div>
  );
}
