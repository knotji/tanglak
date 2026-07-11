import { parseAmountSatang, parseThaiBuddhistYearDate } from "../normalize";
import { groupContinuationLines, type GroupedRow } from "./row-grouping";
import type { DetectedLayout, ExtractedDocument, ExtractedTextItem, LayoutColumnRole, ParsedPdfRow, StatementMetadata } from "./types";

const MONEY_TOKEN = /^\(?-?[\d,]+\.\d{2}\)?-?$/;
const REFERENCE_TOKEN = /\b([A-Z]{2,}\d{4,}|\d{8,})\b/;

const LEADING_DATE_WITH_YEAR =
  /^(\d{1,2}\s*[/\-]\s*\d{1,2}\s*[/\-]\s*\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:ม\.?ค|ก\.?พ|มี\.?ค|เม\.?ย|พ\.?ค|มิ\.?ย|ก\.?ค|ส\.?ค|ก\.?ย|ต\.?ค|พ\.?ย|ธ\.?ค)\.?\s*\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})/i;
const LEADING_DATE_NO_YEAR = /^(\d{1,2})\s*[/\-]\s*(\d{1,2})(?!\s*[/\-]\s*\d)/;
const LEADING_TIME = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)/;

const NUMERIC_ROLES: LayoutColumnRole[] = ["debit", "credit", "amount", "balance"];

function inferYearFromPeriod(month: number, metadata: StatementMetadata): number {
  const periodEnd = metadata.periodEnd.value ?? metadata.statementDate.value;
  const periodStart = metadata.periodStart.value;
  if (periodEnd) {
    const endDate = new Date(periodEnd);
    const endYear = endDate.getUTCFullYear();
    const endMonth = endDate.getUTCMonth() + 1;
    if (periodStart) {
      const startYear = new Date(periodStart).getUTCFullYear();
      // Statement crosses a year boundary (e.g. Dec -> Jan): rows in the
      // later months of the period belong to the start year.
      if (startYear !== endYear && month > endMonth) return startYear;
    }
    return endYear;
  }
  return new Date().getUTCFullYear();
}

interface ExtractedDate {
  isoDate: string;
  matchLength: number;
  usedYearInference: boolean;
}

function extractLeadingDate(text: string, metadata: StatementMetadata): ExtractedDate | null {
  const withYear = text.match(LEADING_DATE_WITH_YEAR);
  if (withYear) {
    return { isoDate: parseThaiBuddhistYearDate(withYear[1]), matchLength: withYear[0].length, usedYearInference: false };
  }

  const noYear = text.match(LEADING_DATE_NO_YEAR);
  if (noYear) {
    const day = parseInt(noYear[1], 10);
    const month = parseInt(noYear[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = inferYearFromPeriod(month, metadata);
      const iso = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
      return { isoDate: iso, matchLength: noYear[0].length, usedYearInference: true };
    }
  }

  return null;
}

interface NumericColumn {
  role: LayoutColumnRole;
  xStart: number;
  xEnd: number;
}

function numericColumns(layout: DetectedLayout): NumericColumn[] {
  return layout.columns
    .filter((c) => NUMERIC_ROLES.includes(c.role))
    .sort((a, b) => a.xStart - b.xStart)
    .map((c) => ({ role: c.role, xStart: c.xStart, xEnd: c.xEnd }));
}

function firstNonNumericColumnStart(layout: DetectedLayout): number {
  const numeric = numericColumns(layout);
  return numeric.length > 0 ? Math.min(...numeric.map((c) => c.xStart)) : Infinity;
}

/**
 * Some compact statement layouts give debit and credit a single shared
 * header label (or two labels close enough together to merge into one
 * detected column), but still right-align debit amounts toward the left
 * of that region and credit amounts toward the right. When a layout has
 * exactly one of debit/credit, this inspects the actual x-positions of
 * amounts landing inside that lone column across the whole statement and,
 * if they form two well-separated clusters, splits the column at the gap
 * midpoint — left cluster keeps the original role, right cluster gets the
 * missing counterpart. Grounded entirely in observed coordinates, never in
 * cell content, and a no-op unless the evidence is unambiguous (a single
 * large gap with a meaningful number of points on both sides).
 */
function splitAmbiguousDirectionColumn(groupedRows: GroupedRow[], columns: NumericColumn[]): NumericColumn[] {
  const hasDebit = columns.some((c) => c.role === "debit");
  const hasCredit = columns.some((c) => c.role === "credit");
  if (hasDebit === hasCredit) return columns; // both or neither present: nothing to split

  const loneRole: "debit" | "credit" = hasDebit ? "debit" : "credit";
  const loneCol = columns.find((c) => c.role === loneRole)!;

  const xs: number[] = [];
  for (const row of groupedRows) {
    for (const item of row.items) {
      if (item.x < loneCol.xStart - 15 || item.x >= loneCol.xEnd) continue;
      if (!MONEY_TOKEN.test(item.text)) continue;
      xs.push(item.x);
    }
  }
  if (xs.length < 10) return columns;

  xs.sort((a, b) => a - b);
  let bestGapIndex = -1;
  let bestGap = 0;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > bestGap) {
      bestGap = gap;
      bestGapIndex = i;
    }
  }

  const leftCount = bestGapIndex;
  const rightCount = xs.length - bestGapIndex;
  // A real sub-column boundary is much wider than ordinary digit/kerning
  // jitter within one column, and needs a meaningful sample on both sides
  // so a single stray outlier can't trigger a false split.
  if (bestGap < 20 || leftCount < 5 || rightCount < 5) return columns;

  const splitX = (xs[bestGapIndex - 1] + xs[bestGapIndex]) / 2;
  const otherRole: LayoutColumnRole = loneRole === "debit" ? "credit" : "debit";

  return columns.flatMap((c) => {
    if (c !== loneCol) return [c];
    return [
      { role: loneRole, xStart: loneCol.xStart, xEnd: splitX },
      { role: otherRole, xStart: splitX, xEnd: loneCol.xEnd },
    ];
  });
}

/**
 * Assigns a money item to its nearest numeric column by comparing item.x to
 * each column's left edge. Nearest-by-start is more robust than strict range
 * containment: cell values are commonly left- or right-aligned differently
 * than their header label, so a hard [xStart, xEnd) boundary check can land
 * a value in the wrong adjacent column when alignment styles differ.
 */
function classifyMoneyItem(item: ExtractedTextItem, columns: NumericColumn[]): LayoutColumnRole {
  let nearest = columns[0];
  let bestDist = Infinity;
  for (const col of columns) {
    const dist = Math.abs(item.x - col.xStart);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = col;
    }
  }
  return nearest?.role ?? "amount";
}

export function parseGenericStatement(
  doc: ExtractedDocument,
  layout: DetectedLayout,
  metadata: StatementMetadata,
): ParsedPdfRow[] {
  const groupedRows = groupContinuationLines(doc, layout);
  const columns = splitAmbiguousDirectionColumn(groupedRows, numericColumns(layout));
  const amountColumnStart = firstNonNumericColumnStart(layout);
  const parsed: ParsedPdfRow[] = [];

  groupedRows.forEach((row, sourceRowIndex) => {
    const warnings: string[] = [];
    const rawText = row.text.trim();

    const dateMatch = extractLeadingDate(rawText, metadata);
    if (!dateMatch) {
      warnings.push("ไม่สามารถอ่านวันที่ของรายการนี้ได้ชัดเจน");
      return;
    }

    let occurredAt = dateMatch.isoDate;
    if (dateMatch.usedYearInference) {
      warnings.push("ไม่พบปีในวันที่ต้นฉบับ ระบบอนุมานปีจากช่วง statement");
    }

    const afterDateText = rawText.slice(dateMatch.matchLength).trim();
    const timeMatch = afterDateText.match(LEADING_TIME);
    if (timeMatch && layout.columns.some((c) => c.role === "time")) {
      const [h, m] = timeMatch[1].split(":").map(Number);
      const base = new Date(occurredAt);
      base.setUTCHours(h, m, 0, 0);
      occurredAt = base.toISOString();
    }

    // Classify every item on the row by position: items inside a numeric
    // column's x-range are amounts for that role; everything else (past the
    // date) contributes to the description text, in reading order.
    const dateItemX = row.items[0]?.x;
    const byRole = new Map<LayoutColumnRole, number>();
    const descriptionItems: ExtractedTextItem[] = [];

    for (const item of row.items) {
      if (dateItemX !== undefined && Math.abs(item.x - dateItemX) < 5) continue; // skip the date token itself
      if (MONEY_TOKEN.test(item.text) && item.x >= amountColumnStart - 10) {
        const role = classifyMoneyItem(item, columns);
        const value = parseAmountSatang(item.text);
        if (!byRole.has(role)) byRole.set(role, value);
        continue;
      }
      descriptionItems.push(item);
    }

    if (byRole.size === 0) {
      warnings.push("ไม่พบจำนวนเงินที่อ่านได้ในรายการนี้");
      return;
    }

    let amountSatang = 0;
    let direction: ParsedPdfRow["direction"] = "unknown";
    if (byRole.has("debit") || byRole.has("credit")) {
      const debit = byRole.get("debit");
      const credit = byRole.get("credit");
      if (debit && debit !== 0) {
        amountSatang = Math.abs(debit);
        direction = "debit";
      } else if (credit && credit !== 0) {
        amountSatang = Math.abs(credit);
        direction = "credit";
      } else {
        warnings.push("ไม่พบยอดเดบิตหรือเครดิตในรายการนี้");
        return;
      }
    } else if (byRole.has("amount")) {
      const raw = byRole.get("amount")!;
      amountSatang = Math.abs(raw);
      direction = raw < 0 ? "debit" : raw > 0 ? "credit" : "unknown";
    } else {
      warnings.push("ไม่สามารถระบุจำนวนเงินของรายการนี้ได้");
      return;
    }

    const runningBalanceSatang = byRole.has("balance") ? byRole.get("balance") : undefined;

    const description = descriptionItems
      .map((i) => i.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const referenceMatch = description.match(REFERENCE_TOKEN);

    let confidence = layout.confidence;
    if (row.continuationLineCount > 0) confidence -= 0.05;
    if (dateMatch.usedYearInference) confidence -= 0.1;
    confidence = Math.max(0.1, Math.min(1, confidence));

    parsed.push({
      sourceRowIndex,
      pageNumber: row.pageNumber,
      sourceLineStart: row.sourceLineStart,
      sourceLineEnd: row.sourceLineEnd,
      rawText: row.text,
      occurredAt,
      description: description || "รายการไม่ระบุชื่อ",
      amountSatang,
      direction,
      runningBalanceSatang,
      referenceNumber: referenceMatch ? referenceMatch[1] : undefined,
      parserSource: "deterministic",
      parserConfidence: confidence,
      validationWarnings: warnings,
    });
  });

  return parsed;
}
