import type { ParsedPdfRow, StatementMetadata } from "./types";

export interface RunningBalanceCheck {
  isValid: boolean;
  warnings: string[];
}

/** Validates row-to-row running balance continuity as a confidence signal, not a hard gate. */
export function validatePdfRunningBalance(rows: ParsedPdfRow[]): RunningBalanceCheck {
  const warnings: string[] = [];
  const sorted = [...rows].sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.runningBalanceSatang === undefined || curr.runningBalanceSatang === undefined) continue;

    let expected = prev.runningBalanceSatang;
    if (curr.direction === "debit") expected -= curr.amountSatang;
    else if (curr.direction === "credit") expected += curr.amountSatang;
    else continue;

    if (expected !== curr.runningBalanceSatang) {
      warnings.push(
        `แถวที่ ${curr.sourceRowIndex + 1} (หน้า ${curr.pageNumber}): ยอดคงเหลือไม่ต่อเนื่อง (คาดว่า ${(expected / 100).toLocaleString()} บาท พบ ${(curr.runningBalanceSatang / 100).toLocaleString()} บาท)`,
      );
    }
  }

  return { isValid: warnings.length === 0, warnings };
}

export interface SummaryTotalsCheck {
  warnings: string[];
}

/** Compares parsed row totals against statement-declared summary figures, when present. */
export function validateSummaryTotals(rows: ParsedPdfRow[], metadata: StatementMetadata): SummaryTotalsCheck {
  const warnings: string[] = [];

  const parsedDebit = rows.filter((r) => r.direction === "debit").reduce((sum, r) => sum + r.amountSatang, 0);
  const parsedCredit = rows.filter((r) => r.direction === "credit").reduce((sum, r) => sum + r.amountSatang, 0);

  if (metadata.totalDebitSatang.value !== undefined && Math.abs(parsedDebit - metadata.totalDebitSatang.value) > 100) {
    warnings.push(
      `ยอดหักบัญชีที่อ่านได้ (${(parsedDebit / 100).toLocaleString()} บาท) ไม่ตรงกับยอดรวมในเอกสาร (${(metadata.totalDebitSatang.value / 100).toLocaleString()} บาท)`,
    );
  }
  if (metadata.totalCreditSatang.value !== undefined && Math.abs(parsedCredit - metadata.totalCreditSatang.value) > 100) {
    warnings.push(
      `ยอดเข้าบัญชีที่อ่านได้ (${(parsedCredit / 100).toLocaleString()} บาท) ไม่ตรงกับยอดรวมในเอกสาร (${(metadata.totalCreditSatang.value / 100).toLocaleString()} บาท)`,
    );
  }
  if (
    metadata.openingBalanceSatang.value !== undefined &&
    metadata.closingBalanceSatang.value !== undefined
  ) {
    const expectedClosing = metadata.openingBalanceSatang.value + parsedCredit - parsedDebit;
    if (Math.abs(expectedClosing - metadata.closingBalanceSatang.value) > 100) {
      warnings.push("ยอดคงเหลือที่คำนวณได้จากรายการที่อ่านไม่ตรงกับยอดคงเหลือปิดบัญชีในเอกสาร");
    }
  }

  return { warnings };
}
