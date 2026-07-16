import Link from "next/link";
import { MoneyAmount } from "@/components/MoneyAmount";

export function CompactStat({
  label,
  amountSatang,
  valueLabel,
  tone = "default",
  href,
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
  /**
   * When given, the whole tile becomes a link -- for a stat that reports a
   * count of things the user can go act on (e.g. pending review items).
   * Omit for a purely informational stat with nowhere to send the user.
   */
  href?: string;
}) {
  const color =
    tone === "income" ? "text-income" : tone === "debt" ? "text-debt" : "text-foreground";

  const content = (
    <>
      <p className="truncate text-[13px] font-medium text-text-secondary">{label}</p>
      {valueLabel ? (
        <p className={`mt-1 block truncate text-xl font-bold ${color}`}>{valueLabel}</p>
      ) : (
        <MoneyAmount satang={amountSatang ?? 0} className={`mt-1 block text-xl font-bold ${color}`} />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block min-w-0 rounded-[16px] bg-muted px-3 py-3 hover:bg-muted/70">
        {content}
      </Link>
    );
  }

  return <div className="min-w-0 rounded-[16px] bg-muted px-3 py-3">{content}</div>;
}
