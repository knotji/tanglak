import { MoneyAmount } from "@/components/MoneyAmount";

export function CompactStat({
  label,
  amountSatang,
  valueLabel,
  tone = "default",
}: {
  label: string;
  /** Required unless valueLabel is given. */
  amountSatang?: number;
  /**
   * Renders this text instead of a money amount -- for a stat that has no
   * meaningful number yet (e.g. "no budget configured" rather than a
   * misleading ฿0 or a negative remaining amount).
   */
  valueLabel?: string;
  tone?: "default" | "income" | "debt";
}) {
  const color =
    tone === "income" ? "text-income" : tone === "debt" ? "text-debt" : "text-foreground";

  return (
    <div className="min-w-0 rounded-[16px] bg-muted px-3 py-3">
      <p className="truncate text-[13px] font-medium text-text-secondary">{label}</p>
      {valueLabel ? (
        <p className={`mt-1 block truncate text-xl font-bold ${color}`}>{valueLabel}</p>
      ) : (
        <MoneyAmount satang={amountSatang ?? 0} className={`mt-1 block text-xl font-bold ${color}`} />
      )}
    </div>
  );
}
