// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildGenericBankStatementPdf,
  buildMalformedPdf,
  buildNoTextLayerPdf,
  buildPasswordProtectedPdf,
  buildUnsupportedLayoutPdf,
} from "../fixtures/pdf-statements";
import { parsePdfStatement } from "@/lib/import/pdf";
import { PdfImportError } from "@/lib/import/pdf/types";
import { validatePdfBuffer } from "@/lib/import/pdf/pdf-file-validator";
import { extractPdfDocument } from "@/lib/import/pdf/pdf-text-extractor";
import { normalizeExtractedDocument } from "@/lib/import/pdf/pdf-page-normalizer";
import { detectStatementMetadata } from "@/lib/import/pdf/statement-metadata";
import { detectGenericLayout } from "@/lib/import/pdf/generic-layout-detector";
import { parseGenericStatement } from "@/lib/import/pdf/generic-statement-parser";
import { validatePdfRunningBalance } from "@/lib/import/pdf/row-validator";
import { computeRowFingerprint } from "@/lib/import/row-fingerprint";
import { parseThaiBuddhistYearDate, parseAmountSatang } from "@/lib/import/normalize";

describe("pdf file validation", () => {
  it("rejects a non-PDF buffer", () => {
    expect(() => validatePdfBuffer(Buffer.from("not a pdf"), 20)).toThrow(PdfImportError);
  });

  it("rejects a file over the size limit", () => {
    const buf = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(100)]);
    let thrown: unknown;
    try {
      validatePdfBuffer(buf, 20_000_000);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PdfImportError);
    expect((thrown as PdfImportError).code).toBe("file_too_large");
  });

  it("flags an /Encrypt marker heuristically", () => {
    const buf = Buffer.from("%PDF-1.4\n/Encrypt 5 0 R\n");
    const result = validatePdfBuffer(buf, buf.length);
    expect(result.looksEncrypted).toBe(true);
  });
});

describe("pdf text extraction", () => {
  it("extracts per-page lines with a text layer from a generated statement", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const doc = await extractPdfDocument(buffer);
    expect(doc.hasTextLayer).toBe(true);
    expect(doc.pageCount).toBeGreaterThanOrEqual(3);
    expect(doc.pages[0].lines.length).toBeGreaterThan(5);
  });

  it("throws no_text_layer for an image-only PDF", async () => {
    const buffer = await buildNoTextLayerPdf();
    await expect(extractPdfDocument(buffer)).rejects.toMatchObject({ code: "no_text_layer" });
  });

  it("throws password_protected_pdf for a real encrypted PDF", async () => {
    const buffer = await buildPasswordProtectedPdf();
    await expect(extractPdfDocument(buffer)).rejects.toMatchObject({ code: "password_protected_pdf" });
  });

  it("throws malformed_pdf for a corrupted document", async () => {
    const buffer = buildMalformedPdf();
    await expect(extractPdfDocument(buffer)).rejects.toMatchObject({ code: "malformed_pdf" });
  });
});

describe("page normalization", () => {
  it("strips repeated header lines from pages after the first", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const raw = await extractPdfDocument(buffer);
    const normalized = normalizeExtractedDocument(raw);
    const headerOccurrences = normalized.pages
      .flatMap((p) => p.lines)
      .filter((l) => l.text.includes("Description") && l.text.includes("Balance"));
    expect(headerOccurrences.length).toBe(1);
  });
});

describe("statement metadata detection", () => {
  it("detects bank name, account last four, and period", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const doc = normalizeExtractedDocument(await extractPdfDocument(buffer));
    const metadata = detectStatementMetadata(doc);
    expect(metadata.bankName.value).toBe("KBank");
    expect(metadata.accountLastFour.value).toBe("1234");
    expect(metadata.periodStart.value).toBe("2026-07-01");
    expect(metadata.periodEnd.value).toBe("2026-07-31");
  });
});

describe("generic layout detection", () => {
  it("detects a debit/credit/balance header with reasonable confidence", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const doc = normalizeExtractedDocument(await extractPdfDocument(buffer));
    const layout = detectGenericLayout(doc);
    expect(layout.layoutId).toBe("A");
    expect(layout.confidence).toBeGreaterThan(0.4);
    expect(layout.columns.some((c) => c.role === "debit")).toBe(true);
    expect(layout.columns.some((c) => c.role === "credit")).toBe(true);
    expect(layout.columns.some((c) => c.role === "balance")).toBe(true);
  });

  it("returns unsupported for a non-tabular document", async () => {
    const buffer = await buildUnsupportedLayoutPdf();
    const doc = normalizeExtractedDocument(await extractPdfDocument(buffer));
    const layout = detectGenericLayout(doc);
    expect(layout.layoutId).toBe("unsupported");
  });
});

describe("full deterministic pipeline", () => {
  it("parses 30+ rows from the generated statement", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const result = await parsePdfStatement(buffer);
    expect(result.rows.length).toBeGreaterThanOrEqual(30);
    expect(result.parserName).toBe("generic-pdf-statement");
    expect(result.accountLastFour).toBe("1234");
    for (const row of result.rows) {
      expect(Number.isInteger(row.amountSatang)).toBe(true);
      expect(["credit", "debit", "unknown"]).toContain(row.direction);
    }
  });

  it("merges the multiline GRAB*FOOD row instead of splitting it", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const result = await parsePdfStatement(buffer);
    const merged = result.rows.find((r) => r.description.includes("GRAB*FOOD"));
    expect(merged).toBeDefined();
    expect(merged?.description).toContain("BANGKOK TH");
  });

  it("infers the missing year from the statement period", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const result = await parsePdfStatement(buffer);
    const inferredRow = result.rows.find((r) => (r.rawData as { validationWarnings?: string[] })?.validationWarnings?.some((w) => w.includes("อนุมานปี")));
    expect(inferredRow).toBeDefined();
    expect(inferredRow?.occurredAt.slice(0, 4)).toBe("2026");
  });

  it("rejects an unsupported-layout document with a Thai fallback message", async () => {
    const buffer = await buildUnsupportedLayoutPdf();
    await expect(parsePdfStatement(buffer)).rejects.toMatchObject({ code: "unsupported_layout" });
  });

  it("rejects a password-protected PDF with a Thai message", async () => {
    const buffer = await buildPasswordProtectedPdf();
    try {
      await parsePdfStatement(buffer);
      throw new Error("expected parsePdfStatement to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(PdfImportError);
      expect((err as PdfImportError).code).toBe("password_protected_pdf");
      expect((err as PdfImportError).message).toContain("รหัสผ่าน");
    }
  });
});

describe("row fingerprint stability", () => {
  it("produces the same fingerprint for identical parses and different ones for different rows", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const resultA = await parsePdfStatement(buffer);
    const resultB = await parsePdfStatement(buffer);

    const fingerprintsA = resultA.rows.map((r) => computeRowFingerprint("batch-1", r));
    const fingerprintsB = resultB.rows.map((r) => computeRowFingerprint("batch-1", r));
    expect(fingerprintsA).toEqual(fingerprintsB);

    const uniqueCount = new Set(fingerprintsA).size;
    expect(uniqueCount).toBe(fingerprintsA.length);

    const differentBatch = resultA.rows.map((r) => computeRowFingerprint("batch-2", r));
    expect(differentBatch[0]).not.toBe(fingerprintsA[0]);
  });
});

describe("running balance validation", () => {
  it("flags rows where the running balance does not follow debit/credit direction", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const doc = normalizeExtractedDocument(await extractPdfDocument(buffer));
    const layout = detectGenericLayout(doc);
    const metadata = detectStatementMetadata(doc);
    const rows = parseGenericStatement(doc, layout, metadata);
    // The generated fixture's balances are internally consistent, so this should pass clean.
    const check = validatePdfRunningBalance(rows);
    expect(check.isValid).toBe(true);

    // Corrupt one balance and confirm the validator now flags it.
    const corrupted = rows.map((r, i) => (i === 2 ? { ...r, runningBalanceSatang: (r.runningBalanceSatang ?? 0) + 99900 } : r));
    const corruptedCheck = validatePdfRunningBalance(corrupted);
    expect(corruptedCheck.isValid).toBe(false);
    expect(corruptedCheck.warnings.length).toBeGreaterThan(0);
  });
});

describe("shared date/money normalization reused from CSV pipeline", () => {
  it("parses Thai Buddhist year dates", () => {
    const iso = parseThaiBuddhistYearDate("15/07/2569");
    expect(iso.slice(0, 10)).toBe("2026-07-15");
  });

  it("parses parenthesized negative amounts", () => {
    expect(parseAmountSatang("(1,234.56)")).toBe(-123456);
  });
});
