import { ZodError, type ZodIssue } from "zod";

export const DOCUMENT_EXTRACTION_FALLBACK_MESSAGE =
  "การอ่านข้อมูลบางส่วนไม่ครบ\nลองประมวลผลอีกครั้ง หรือกรอกข้อมูลด้วยตนเอง";

export const DOCUMENT_EXTRACTION_TIMEOUT_MESSAGE =
  "การประมวลผลใช้เวลานานเกินไป\nลองใหม่อีกครั้งได้โดยไม่ต้องอัปโหลดเอกสารใหม่";

export const DOCUMENT_EXTRACTION_RATE_LIMIT_MESSAGE =
  "ระบบอ่านเอกสารกำลังมีผู้ใช้งานมาก\nกรุณาลองใหม่อีกครั้งในอีกสักครู่";

export const DOCUMENT_EXTRACTION_PERMANENT_MESSAGE =
  "ยังอ่านเอกสารนี้ไม่ได้ครบ\nกรอกข้อมูลด้วยตนเองได้ทันที";

export type DocumentExtractionErrorCode =
  | "timeout"
  | "rate_limited"
  | "transient_provider_error"
  | "provider_parse_failed"
  | "provider_error"
  | "schema_validation_failed"
  | "incomplete_financial_extraction"
  | "unsupported_document"
  | "processing_claim_failed";

// `transaction.occurredAt` is intentionally absent from this set. A missing
// or unparseable transaction timestamp is a draft-review issue, not a
// reason to discard the whole extraction -- see the comment on
// extractedFinancialDocumentSchema's superRefine in schemas.ts. Every path
// still listed here can genuinely make a draft unusable and must continue
// to raise `incomplete_financial_extraction`.
const FINANCIAL_FIELD_PATHS = new Set([
  "documentType",
  "transaction.type",
  "transaction.amount",
  "salary.netIncome",
  "receipt.totalPaid",
  "debt.amountDue",
  "debt.minimumPayment",
  "debt.dueDate",
]);

export class DocumentExtractionError extends Error {
  readonly code: DocumentExtractionErrorCode;
  readonly userMessage: string;
  readonly missingFields: string[];
  readonly retryable: boolean;

  constructor(
    code: DocumentExtractionErrorCode,
    options?: { cause?: unknown; missingFields?: string[]; retryable?: boolean; userMessage?: string },
  ) {
    const userMessage = options?.userMessage ?? defaultUserMessage(code);
    super(userMessage);
    this.name = "DocumentExtractionError";
    this.code = code;
    this.userMessage = userMessage;
    this.missingFields = options?.missingFields ?? [];
    this.retryable = options?.retryable ?? defaultRetryable(code);
    this.cause = options?.cause;
  }
}

function defaultRetryable(code: DocumentExtractionErrorCode): boolean {
  return code === "timeout" || code === "rate_limited" || code === "transient_provider_error";
}

function defaultUserMessage(code: DocumentExtractionErrorCode): string {
  if (code === "timeout") return DOCUMENT_EXTRACTION_TIMEOUT_MESSAGE;
  if (code === "rate_limited") return DOCUMENT_EXTRACTION_RATE_LIMIT_MESSAGE;
  if (
    code === "unsupported_document" ||
    code === "schema_validation_failed" ||
    code === "incomplete_financial_extraction" ||
    code === "provider_parse_failed"
  ) {
    return DOCUMENT_EXTRACTION_PERMANENT_MESSAGE;
  }
  return DOCUMENT_EXTRACTION_FALLBACK_MESSAGE;
}

function issuePath(issue: ZodIssue): string {
  return issue.path.map(String).join(".");
}

function missingFinancialFields(issues: ZodIssue[]): string[] {
  return issues
    .filter((issue) => issue.code === "invalid_type" && issue.message === "Required")
    .map(issuePath)
    .filter((path) => FINANCIAL_FIELD_PATHS.has(path));
}

export function classifySchemaValidationError(error: ZodError): DocumentExtractionError {
  const missingFields = Array.from(new Set(missingFinancialFields(error.issues))).sort();

  if (missingFields.length > 0) {
    return new DocumentExtractionError("incomplete_financial_extraction", {
      cause: error,
      missingFields,
    });
  }

  return new DocumentExtractionError("schema_validation_failed", { cause: error });
}

export function toDocumentExtractionError(error: unknown): DocumentExtractionError {
  if (error instanceof DocumentExtractionError) return error;
  if (error instanceof ZodError) return classifySchemaValidationError(error);
  return new DocumentExtractionError("provider_error", { cause: error });
}

export function safeDocumentExtractionMessage(error: unknown): string {
  if (error instanceof DocumentExtractionError) return error.userMessage;
  if (error instanceof ZodError) return DOCUMENT_EXTRACTION_FALLBACK_MESSAGE;
  return DOCUMENT_EXTRACTION_FALLBACK_MESSAGE;
}
