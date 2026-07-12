import { formatTHB } from "@/lib/finance/money";

export type MoneyAmountTone = "income" | "expense" | "debt" | "neutral";
export type MoneyAmountFormat = "full" | "compact";

function assertIntegerSatang(satang: number) {
  if (!Number.isInteger(satang)) {
    throw new Error("MoneyAmount requires an integer satang value");
  }
}

function formatCompactTHB(satang: number, showPositiveSign = false): string {
  assertIntegerSatang(satang);
  const normalized = Object.is(satang, -0) ? 0 : satang;
  const sign = normalized < 0 ? "-" : showPositiveSign && normalized > 0 ? "+" : "";
  const absoluteBaht = Math.trunc(Math.abs(normalized) / 100);

  if (absoluteBaht < 10_000) {
    return formatTHB(normalized, { showPositiveSign });
  }

  const divisor = absoluteBaht >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = absoluteBaht >= 1_000_000 ? "M" : "K";
  const scaledTenths = Math.round(absoluteBaht / (divisor / 10));
  const whole = Math.trunc(scaledTenths / 10);
  const decimal = scaledTenths % 10;
  const label = decimal === 0 ? `${whole}` : `${whole}.${decimal}`;

  return `${sign}฿${label}${suffix}`;
}

export function MoneyAmount({
  satang,
  tone = "neutral",
  format = "full",
  showSign = false,
  srLabel,
  className = "",
}: {
  satang: number;
  tone?: MoneyAmountTone;
  format?: MoneyAmountFormat;
  showSign?: boolean;
  srLabel?: string;
  className?: string;
}) {
  assertIntegerSatang(satang);
  const formatted = format === "compact" ? formatCompactTHB(satang, showSign) : formatTHB(satang, { showPositiveSign: showSign });
  const toneClass =
    tone === "income"
      ? "text-income"
      : tone === "expense"
        ? "text-expense"
        : tone === "debt"
          ? "text-debt"
          : "text-foreground";
  const semanticTone = tone === "income" ? "รายรับ" : tone === "expense" || tone === "debt" ? "รายจ่าย" : "ยอดเงิน";

  return (
    <span
      className={`tabular whitespace-nowrap ${toneClass} ${className}`}
      aria-label={srLabel ?? `${semanticTone} ${formatTHB(satang, { showPositiveSign: showSign })}`}
    >
      {formatted}
    </span>
  );
}
