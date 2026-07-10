import { formatTHB } from "@/lib/finance/money";

export function MoneyAmount({
  satang,
  className = "",
}: {
  satang: number;
  className?: string;
}) {
  return (
    <span className={`tabular ${className}`} aria-label={`${formatTHB(satang)} บาท`}>
      {formatTHB(satang)}
    </span>
  );
}
