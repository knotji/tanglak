import { parseAmountSatang, parseThaiBuddhistYearDate } from "../normalize";
import type { ExtractedDocument, StatementMetadata, StatementMetadataField } from "./types";

const BANK_KEYWORDS: Array<{ match: RegExp; name: string }> = [
  { match: /kasikorn|kbank|กสิกรไทย/i, name: "KBank" },
  { match: /siam commercial|scb\b|ไทยพาณิชย์/i, name: "SCB" },
  { match: /bangkok bank|\bbbl\b|กรุงเทพ/i, name: "Bangkok Bank" },
  { match: /krungsri|กรุงศรี/i, name: "Krungsri" },
  { match: /krung ?thai|\bktb\b|กรุงไทย/i, name: "Krungthai" },
  { match: /ttb|ทหารไทยธนชาต/i, name: "TTB" },
  { match: /government savings|ออมสิน/i, name: "GSB" },
  { match: /\bktc\b/i, name: "KTC" },
  { match: /\buob\b/i, name: "UOB" },
  { match: /\bcimb\b/i, name: "CIMB" },
];

const CREDIT_CARD_HINT = /credit card|บัตรเครดิต|statement balance|minimum payment|ยอดขั้นต่ำ/i;

function emptyField<T>(): StatementMetadataField<T> {
  return { confidence: 0, warnings: [] };
}

function found<T>(value: T, confidence = 0.7): StatementMetadataField<T> {
  return { value, confidence, warnings: [] };
}

function maskAccountNumber(digits: string): string {
  const lastFour = digits.slice(-4);
  return lastFour;
}

function findFirstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) return m;
  }
  return null;
}

const DATE_TOKEN =
  "(\\d{1,2}\\s*[/\\-]\\s*\\d{1,2}\\s*[/\\-]\\s*\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+[ก-๙.]+\\s+\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{2,4})";

export function detectStatementMetadata(doc: ExtractedDocument): StatementMetadata {
  const fullText = doc.pages.map((p) => p.rawText).join("\n");

  const bank = BANK_KEYWORDS.find((k) => k.match.test(fullText));
  const bankName = bank ? found(bank.name, 0.8) : emptyField<string>();

  const statementType = CREDIT_CARD_HINT.test(fullText)
    ? found("credit_card_statement", 0.6)
    : found("bank_statement", 0.4);

  const accountMatch = findFirstMatch(fullText, [
    /(?:account\s*(?:no\.?|number)?|เลขที่บัญชี|เลขบัญชี)\s*[:\-]?\s*[x•*\d\- ]*?(\d{4})(?!\d)/i,
    /[x•*]{2,}[\-\s]?(\d{4})(?!\d)/,
    /card\s*(?:no\.?|number)?\s*[:\-]?\s*[x•*\d\- ]*?(\d{4})(?!\d)/i,
  ]);
  const accountLastFour = accountMatch ? found(maskAccountNumber(accountMatch[1]), 0.7) : emptyField<string>();

  const accountNameMatch = findFirstMatch(fullText, [
    /account name\s*[:\-]?\s*([^\n]{3,40})/i,
    /ชื่อบัญชี\s*[:\-]?\s*([^\n]{3,40})/,
  ]);
  const accountDisplayName = accountNameMatch
    ? found(accountNameMatch[1].trim(), 0.6)
    : emptyField<string>();

  const currency = /THB|บาท/i.test(fullText) ? found("THB", 0.9) : found("THB", 0.3);

  const periodMatch = findFirstMatch(fullText, [
    new RegExp(`(?:statement period|รอบบัญชี|period)\\s*[:\\-]?\\s*${DATE_TOKEN}\\s*(?:-|to|ถึง|–)\\s*${DATE_TOKEN}`, "i"),
  ]);
  let periodStart = emptyField<string>();
  let periodEnd = emptyField<string>();
  if (periodMatch) {
    try {
      periodStart = found(parseThaiBuddhistYearDate(periodMatch[1]).slice(0, 10), 0.65);
      periodEnd = found(parseThaiBuddhistYearDate(periodMatch[2]).slice(0, 10), 0.65);
    } catch {
      periodStart.warnings.push("ไม่สามารถแปลงวันที่ช่วง statement ได้");
    }
  }

  const statementDateMatch = findFirstMatch(fullText, [
    new RegExp(`(?:statement date|วันที่ออกใบแจ้งยอด|issue date)\\s*[:\\-]?\\s*${DATE_TOKEN}`, "i"),
  ]);
  const statementDate = statementDateMatch
    ? found(parseThaiBuddhistYearDate(statementDateMatch[1]).slice(0, 10), 0.6)
    : emptyField<string>();

  const openingBalanceMatch = findFirstMatch(fullText, [
    /(?:opening balance|ยอดยกมา|balance brought forward)\s*[:\-]?\s*([\d,]+\.\d{2})/i,
  ]);
  const openingBalanceSatang = openingBalanceMatch
    ? found(parseAmountSatang(openingBalanceMatch[1]), 0.6)
    : emptyField<number>();

  const closingBalanceMatch = findFirstMatch(fullText, [
    /(?:closing balance|ยอดคงเหลือยกไป|ยอดยกไป|ending balance)\s*[:\-]?\s*([\d,]+\.\d{2})/i,
  ]);
  const closingBalanceSatang = closingBalanceMatch
    ? found(parseAmountSatang(closingBalanceMatch[1]), 0.6)
    : emptyField<number>();

  const totalDebitMatch = findFirstMatch(fullText, [
    /(?:total debit|total withdrawal|ยอดหักบัญชีรวม|ยอดถอนรวม)\s*[:\-]?\s*([\d,]+\.\d{2})/i,
  ]);
  const totalDebitSatang = totalDebitMatch ? found(parseAmountSatang(totalDebitMatch[1]), 0.5) : emptyField<number>();

  const totalCreditMatch = findFirstMatch(fullText, [
    /(?:total credit|total deposit|ยอดเข้าบัญชีรวม|ยอดฝากรวม)\s*[:\-]?\s*([\d,]+\.\d{2})/i,
  ]);
  const totalCreditSatang = totalCreditMatch
    ? found(parseAmountSatang(totalCreditMatch[1]), 0.5)
    : emptyField<number>();

  return {
    bankName,
    statementType,
    accountLastFour,
    accountDisplayName,
    currency,
    periodStart,
    periodEnd,
    statementDate,
    openingBalanceSatang,
    closingBalanceSatang,
    totalDebitSatang,
    totalCreditSatang,
    pageCount: doc.pageCount,
  };
}
