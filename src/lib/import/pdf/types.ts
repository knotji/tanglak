export type PdfImportErrorCode =
  | "unsupported_file_type"
  | "file_too_large"
  | "malformed_pdf"
  | "password_protected_pdf"
  | "no_text_layer"
  | "unsupported_layout"
  | "extraction_failed";

const THAI_MESSAGES: Record<PdfImportErrorCode, string> = {
  unsupported_file_type: "ไฟล์นี้ไม่ใช่ PDF ที่รองรับ",
  file_too_large: "ไฟล์มีขนาดใหญ่เกินไป",
  malformed_pdf: "ไฟล์ PDF นี้เสียหายหรือเปิดไม่ได้",
  password_protected_pdf:
    "Statement นี้มีรหัสผ่าน กรุณาดาวน์โหลดไฟล์ที่ไม่ล็อกแล้วลองใหม่",
  no_text_layer:
    "ไฟล์นี้ไม่มีข้อความที่อ่านได้ Phase นี้ยังไม่รองรับ Statement แบบสแกน ลองใช้ CSV แทน",
  unsupported_layout:
    "อ่านรูปแบบตารางนี้ได้ไม่ครบ ลองดาวน์โหลด CSV จากธนาคารแล้วนำเข้าแทนได้",
  extraction_failed: "อ่าน Statement นี้ได้ไม่ครบ กรุณาลองใหม่อีกครั้ง",
};

export class PdfImportError extends Error {
  code: PdfImportErrorCode;

  constructor(code: PdfImportErrorCode, detail?: string) {
    super(THAI_MESSAGES[code]);
    this.name = "PdfImportError";
    this.code = code;
    if (detail) {
      // Kept off the user-facing `.message` (never shown in the UI) but
      // attached to `.stack` so server-side logs retain a diagnostic trail.
      this.stack = `${this.stack}\nDetail: ${detail}`;
    }
  }
}

export interface ExtractedTextItem {
  text: string;
  x: number;
  y: number;
}

export interface ExtractedLine {
  lineIndex: number;
  y: number;
  text: string;
  items: ExtractedTextItem[];
}

export interface ExtractedPage {
  pageNumber: number;
  rawText: string;
  lines: ExtractedLine[];
  warnings: string[];
}

export interface ExtractedDocument {
  pageCount: number;
  pages: ExtractedPage[];
  hasTextLayer: boolean;
}

export interface StatementMetadataField<T> {
  value?: T;
  confidence: number;
  warnings: string[];
}

export interface StatementMetadata {
  bankName: StatementMetadataField<string>;
  statementType: StatementMetadataField<string>;
  accountLastFour: StatementMetadataField<string>;
  accountDisplayName: StatementMetadataField<string>;
  currency: StatementMetadataField<string>;
  periodStart: StatementMetadataField<string>;
  periodEnd: StatementMetadataField<string>;
  statementDate: StatementMetadataField<string>;
  openingBalanceSatang: StatementMetadataField<number>;
  closingBalanceSatang: StatementMetadataField<number>;
  totalDebitSatang: StatementMetadataField<number>;
  totalCreditSatang: StatementMetadataField<number>;
  pageCount: number;
}

export type LayoutColumnRole =
  | "date"
  | "posted_date"
  | "time"
  | "description"
  | "debit"
  | "credit"
  | "amount"
  | "balance"
  | "reference"
  | "ignore";

export interface LayoutColumn {
  role: LayoutColumnRole;
  headerLabel: string;
  index: number;
  xStart: number;
  xEnd: number;
}

export type LayoutId = "A" | "B" | "C" | "D" | "E" | "F" | "unsupported";

export interface DetectedLayout {
  layoutId: LayoutId;
  columns: LayoutColumn[];
  headerPageNumber?: number;
  headerLineIndex?: number;
  headerText?: string;
  confidence: number;
  warnings: string[];
  source: "deterministic" | "gemini_assisted";
}

export type ParserRowSource = "deterministic" | "gemini_assisted";

export interface ParsedPdfRow {
  sourceRowIndex: number;
  pageNumber: number;
  sourceLineStart: number;
  sourceLineEnd: number;
  rawText: string;
  occurredAt: string;
  postedAt?: string;
  description: string;
  amountSatang: number;
  direction: "credit" | "debit" | "unknown";
  runningBalanceSatang?: number;
  referenceNumber?: string;
  parserSource: ParserRowSource;
  parserConfidence: number;
  validationWarnings: string[];
}
