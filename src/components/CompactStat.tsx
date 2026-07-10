import { MoneyAmount } from "@/components/MoneyAmount";

export function CompactStat({
  label,
  amountSatang,
  tone = "default",
}: {
  label: string;
  amountSatang: number;
  tone?: "default" | "income" | "debt";
}) {
  const color =
    tone === "income" ? "text-income" : tone === "debt" ? "text-debt" : "text-foreground";

  return (
    <div className="min-w-0 rounded-[16px] bg-muted px-3 py-3">
      <p className="truncate text-[13px] font-medium text-text-secondary">{label}</p>
      <MoneyAmount satang={amountSatang} className={`mt-1 block text-xl font-bold ${color}`} />
    </div>
  );
}
