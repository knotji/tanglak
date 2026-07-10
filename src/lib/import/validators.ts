import type { ParsedTransaction } from "./types";

export function detectCSVDelimiter(firstLine: string): string {
  const delimiters = [",", ";", "\t", "|"];
  let bestDelimiter = ",";
  let maxCount = -1;

  for (const delim of delimiters) {
    const count = (firstLine.split(delim).length || 1) - 1;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delim;
    }
  }
  return bestDelimiter;
}

export interface HeaderMapping {
  dateIdx: number;
  descriptionIdx: number;
  amountIdx: number; // Single signed column or fallback
  debitIdx: number;  // Withdrawal column
  creditIdx: number; // Deposit column
  balanceIdx: number;
  referenceIdx: number;
}

export function detectCSVHeaders(headers: string[]): HeaderMapping {
  const cleanHeaders = headers.map(h => h.trim().toLowerCase());

  let dateIdx = -1;
  let descriptionIdx = -1;
  let amountIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  let balanceIdx = -1;
  let referenceIdx = -1;

  const dateKeywords = ["date", "วัน", "เวลา", "occurred"];
  const descKeywords = ["desc", "detail", "ราย", "รายการ", "memo", "particular"];
  const amountKeywords = ["amount", "จำนวน", "ยอด", "เงิน", "value"];
  const debitKeywords = ["debit", "withdraw", "จ่าย", "ถอน", "ออก", "expense"];
  const creditKeywords = ["credit", "deposit", "เข้า", "ฝาก", "รับ", "income"];
  const balanceKeywords = ["balance", "คงเหลือ", "ยอดคงเหลือ", "running"];
  const refKeywords = ["ref", "อ้างอิง", "เลขที่", "transaction id", "id"];

  cleanHeaders.forEach((header, idx) => {
    if (dateKeywords.some(kw => header.includes(kw)) && dateIdx === -1) dateIdx = idx;
    else if (debitKeywords.some(kw => header.includes(kw)) && debitIdx === -1) debitIdx = idx;
    else if (creditKeywords.some(kw => header.includes(kw)) && creditIdx === -1) creditIdx = idx;
    else if (balanceKeywords.some(kw => header.includes(kw)) && balanceIdx === -1) balanceIdx = idx;
    else if (refKeywords.some(kw => header.includes(kw)) && referenceIdx === -1) referenceIdx = idx;
    else if (descKeywords.some(kw => header.includes(kw)) && descriptionIdx === -1) descriptionIdx = idx;
    else if (amountKeywords.some(kw => header.includes(kw)) && amountIdx === -1) amountIdx = idx;
  });

  // Fallback mappings if not found
  if (dateIdx === -1) dateIdx = 0;
  if (descriptionIdx === -1) descriptionIdx = cleanHeaders.length > 1 ? 1 : 0;
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    amountIdx = cleanHeaders.length > 2 ? 2 : 0;
  }

  return {
    dateIdx,
    descriptionIdx,
    amountIdx,
    debitIdx,
    creditIdx,
    balanceIdx,
    referenceIdx
  };
}

export interface RunningBalanceValidationResult {
  isValid: boolean;
  warnings: string[];
}

export function validateRunningBalance(
  rows: ParsedTransaction[],
): RunningBalanceValidationResult {
  const warnings: string[] = [];

  // Sort rows chronologically to validate progression
  const sorted = [...rows].sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (prev.runningBalanceSatang !== undefined && curr.runningBalanceSatang !== undefined) {
      let expectedBalance = prev.runningBalanceSatang;
      
      if (curr.direction === "debit") {
        expectedBalance -= curr.amountSatang;
      } else if (curr.direction === "credit") {
        expectedBalance += curr.amountSatang;
      } else {
        // Signed amount calculation
        expectedBalance += curr.amountSatang;
      }

      if (expectedBalance !== curr.runningBalanceSatang) {
        warnings.push(
          `บรรทัดที่ ${curr.sourceRowIndex + 1}: ยอดเงินคงเหลือไม่สอดคล้อง (คาดหวัง ${expectedBalance / 100} THB, พบ ${curr.runningBalanceSatang / 100} THB)`
        );
      }
    }
  }

  return {
    isValid: warnings.length === 0,
    warnings
  };
}
