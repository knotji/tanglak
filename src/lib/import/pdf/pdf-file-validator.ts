import { PdfImportError } from "./types";

const MAX_PDF_SIZE_BYTES = 10_000_000;
const MAX_REASONABLE_PAGES = 200;

export interface PdfValidationResult {
  looksEncrypted: boolean;
}

/**
 * Cheap, synchronous pre-checks on the raw bytes before we spend time on a full
 * pdfjs parse. Catches non-PDF uploads, oversized files, and an /Encrypt marker
 * (used by both real encrypted PDFs and our handcrafted test fixtures).
 */
export function validatePdfBuffer(buffer: Buffer, fileSize: number): PdfValidationResult {
  if (fileSize > MAX_PDF_SIZE_BYTES) {
    throw new PdfImportError("file_too_large", `size=${fileSize}`);
  }

  const header = buffer.subarray(0, 5).toString("latin1");
  if (header !== "%PDF-") {
    throw new PdfImportError("unsupported_file_type", `header=${header}`);
  }

  const scanWindow = buffer.subarray(0, Math.min(buffer.length, 200_000)).toString("latin1");
  const looksEncrypted = /\/Encrypt\b/.test(scanWindow);

  return { looksEncrypted };
}

export function assertReasonablePageCount(pageCount: number): void {
  if (pageCount <= 0) {
    throw new PdfImportError("malformed_pdf", "zero-page document");
  }
  if (pageCount > MAX_REASONABLE_PAGES) {
    throw new PdfImportError("unsupported_layout", `page count ${pageCount} exceeds limit`);
  }
}
