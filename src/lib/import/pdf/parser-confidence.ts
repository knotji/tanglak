import type { DetectedLayout, ParsedPdfRow } from "./types";

export const MIN_LAYOUT_CONFIDENCE = 0.4;
export const MIN_ROW_COUNT_FOR_TRUST = 1;

export interface ParserConfidenceSummary {
  layoutConfidence: number;
  averageRowConfidence: number;
  rowsWithWarnings: number;
  totalRows: number;
  needsReview: boolean;
}

export function summarizeParserConfidence(layout: DetectedLayout, rows: ParsedPdfRow[]): ParserConfidenceSummary {
  const totalRows = rows.length;
  const averageRowConfidence =
    totalRows === 0 ? 0 : rows.reduce((sum, r) => sum + r.parserConfidence, 0) / totalRows;
  const rowsWithWarnings = rows.filter((r) => r.validationWarnings.length > 0).length;

  return {
    layoutConfidence: layout.confidence,
    averageRowConfidence,
    rowsWithWarnings,
    totalRows,
    needsReview: layout.confidence < 0.6 || averageRowConfidence < 0.6 || rowsWithWarnings > totalRows * 0.2,
  };
}
