import { ZodError, type ZodIssue } from "zod";

export const DOCUMENT_EXTRACTION_FALLBACK_MESSAGE =
  "การอ่านข้อมูลบางส่วนไม่ครบ\nลองประมวลผลอีกครั้ง หรือกรอกข้อมูลด้วยตนเอง";

export type DocumentExtractionErrorCode =
  | "provider_parse_failed"
  | "provider_error"
  | "schema_validation_failed"
  | "incomplete_financial_extraction";

const FINANCIAL_FIELD_PATHS = new Set([
  "documentType",
  "transaction.type",
  "transaction.amount",
  "transaction.occurredAt",
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

  constructor(code: DocumentExtractionErrorCode, options?: { cause?: unknown; missingFields?: string[] }) {
    super(DOCUMENT_EXTRACTION_FALLBACK_MESSAGE);
    this.name = "DocumentExtractionError";
    this.code = code;
    this.userMessage = DOCUMENT_EXTRACTION_FALLBACK_MESSAGE;
    this.missingFields = options?.missingFields ?? [];
    this.cause = options?.cause;
  }
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
