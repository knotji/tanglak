import { PdfImportError } from "./types";
import { validatePdfBuffer } from "./pdf-file-validator";
import { extractPdfDocument } from "./pdf-text-extractor";
import { normalizeExtractedDocument } from "./pdf-page-normalizer";
import { detectStatementMetadata } from "./statement-metadata";
import { detectGenericLayout } from "./generic-layout-detector";
import { parseGenericStatement } from "./generic-statement-parser";
import { groupContinuationLines } from "./row-grouping";
import { validatePdfRunningBalance, validateSummaryTotals } from "./row-validator";
import { summarizeParserConfidence, MIN_LAYOUT_CONFIDENCE } from "./parser-confidence";
import { assistHeaderMapping } from "./gemini-assist";
import type { ParseResult, ParsedTransaction } from "../types";

export const PDF_PARSER_NAME = "generic-pdf-statement";
export const PDF_PARSER_VERSION = "2.0.0";

export type ParsePdfStatementInput = {
  bytes: Uint8Array;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  password?: string;
};

export async function parsePdfStatement(input: ParsePdfStatementInput): Promise<ParseResult> {
  const { bytes } = input;
  const { looksEncrypted } = validatePdfBuffer(Buffer.from(bytes), input.fileSize);
  if (looksEncrypted) {
    // Fast path: skip the full pdfjs parse attempt for a document we can
    // already tell is encrypted from its raw bytes (pdfjs would throw the
    // same PasswordException anyway, just after doing more work first).
    throw new PdfImportError("password_protected_pdf", "buffer contains an /Encrypt marker");
  }

  const rawDoc = await extractPdfDocument({ bytes });
  const doc = normalizeExtractedDocument(rawDoc);

  const metadata = detectStatementMetadata(doc);
  let layout = detectGenericLayout(doc);

  if (layout.confidence < MIN_LAYOUT_CONFIDENCE || layout.layoutId === "unsupported") {
    if (layout.headerText) {
      const sampleLines = doc.pages[0]?.lines.slice(0, 5).map((l) => l.text) ?? [];
      const assist = await assistHeaderMapping(layout.headerText, sampleLines);
      if (assist.ok && assist.result && assist.result.confidence >= MIN_LAYOUT_CONFIDENCE) {
        layout = {
          ...layout,
          columns: layout.columns.map((col) => {
            const mapped = assist.result!.columns.find((c) => c.index === col.index);
            return mapped ? { ...col, role: mapped.role } : col;
          }),
          confidence: assist.result.confidence,
          warnings: [...layout.warnings, ...assist.result.warnings, "จับคู่คอลัมน์ด้วยความช่วยเหลือของ AI"],
          source: "gemini_assisted",
        };
      }
    }
  }

  if (layout.layoutId === "unsupported" || layout.confidence < MIN_LAYOUT_CONFIDENCE) {
    // Structural-only diagnostic (page/line/column counts, no cell content)
    // to help debug future unsupported-layout reports without logging any
    // financial data.
    const lineCounts = doc.pages.map((p) => p.lines.length).join(",");
    throw new PdfImportError(
      "unsupported_layout",
      `pageCount=${doc.pageCount} linesPerPage=[${lineCounts}] candidateColumnCount=${layout.columns.length} confidence=${layout.confidence.toFixed(2)} reason=header_not_found_or_low_confidence`,
    );
  }

  const parsedRows = parseGenericStatement(doc, layout, metadata);
  if (parsedRows.length === 0) {
    // candidateRowCount = how many date-led rows the grouper found at all
    // (independent of whether they went on to parse an amount) — this
    // distinguishes "no date-shaped rows found" from "rows found but no
    // amount token recognized", without logging any row content.
    const candidateRowCount = groupContinuationLines(doc, layout).length;
    throw new PdfImportError(
      "unsupported_layout",
      `pageCount=${doc.pageCount} candidateColumnCount=${layout.columns.length} candidateRowCount=${candidateRowCount} layoutId=${layout.layoutId} confidence=${layout.confidence.toFixed(2)} reason=zero_rows_parsed_from_detected_layout`,
    );
  }

  const balanceCheck = validatePdfRunningBalance(parsedRows);
  const totalsCheck = validateSummaryTotals(parsedRows, metadata);
  const confidenceSummary = summarizeParserConfidence(layout, parsedRows);

  const rows: ParsedTransaction[] = parsedRows.map((row) => ({
    sourceRowIndex: row.sourceRowIndex,
    occurredAt: row.occurredAt,
    description: row.description,
    amountSatang: row.amountSatang,
    direction: row.direction,
    runningBalanceSatang: row.runningBalanceSatang,
    referenceNumber: row.referenceNumber,
    pageNumber: row.pageNumber,
    sourceLineStart: row.sourceLineStart,
    sourceLineEnd: row.sourceLineEnd,
    parserSource: row.parserSource,
    parserConfidence: row.parserConfidence,
    rawData: {
      rawText: row.rawText,
      validationWarnings: row.validationWarnings,
    },
  }));

  return {
    sourceType: metadata.statementType.value === "credit_card_statement" ? "credit_card_statement_pdf" : "bank_statement_pdf",
    sourceName: metadata.bankName.value ? `${metadata.bankName.value} Statement` : "PDF Statement",
    rows,
    period: {
      periodStart: metadata.periodStart.value,
      periodEnd: metadata.periodEnd.value,
      statementDate: metadata.statementDate.value,
    },
    accountLastFour: metadata.accountLastFour.value,
    totalRows: rows.length,
    statementMetadata: metadata,
    detectedLayout: {
      layoutId: layout.layoutId,
      confidence: layout.confidence,
      source: layout.source,
      columns: layout.columns.map((c) => ({ role: c.role, headerLabel: c.headerLabel })),
      warnings: [...layout.warnings, ...balanceCheck.warnings, ...totalsCheck.warnings],
      needsReview: confidenceSummary.needsReview,
    },
    pageCount: doc.pageCount,
    parserName: PDF_PARSER_NAME,
    parserVersion: PDF_PARSER_VERSION,
  };
}
