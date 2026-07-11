import { getBangkokMonthString, isValidMonthQuery } from "@/lib/finance/date";
import type { ImportBatch, ImportRow } from "@/types/domain";

function toMonth(value: string | undefined): string | undefined {
  const month = value?.slice(0, 7);
  return isValidMonthQuery(month) ? month : undefined;
}

export function getImportSummaryTransactionMonth({
  rows,
  batch,
  fallbackMonth = getBangkokMonthString(),
}: {
  rows: ImportRow[];
  batch: Pick<ImportBatch, "periodEnd" | "statementDate" | "periodStart">;
  fallbackMonth?: string;
}): string {
  const importedMonths = rows
    .filter((row) => row.reviewStatus === "imported" && row.importDecision !== "skip")
    .map((row) => toMonth(row.occurredAt))
    .filter((month): month is string => Boolean(month))
    .sort();

  if (importedMonths.length > 0) {
    return importedMonths[importedMonths.length - 1];
  }

  return toMonth(batch.periodEnd) ?? toMonth(batch.statementDate) ?? toMonth(batch.periodStart) ?? fallbackMonth;
}
