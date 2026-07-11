// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../../next.config";
import { describe, expect, it, vi } from "vitest";
import {
  buildCompactHeaderStatementPdf,
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

function extractInput(buffer: Buffer) {
  return { bytes: new Uint8Array(buffer) };
}

function parseInput(buffer: Buffer) {
  return {
    bytes: new Uint8Array(buffer),
    originalFilename: "statement.pdf",
    mimeType: "application/pdf",
    fileSize: buffer.byteLength,
    storagePath: "user/history-imports/batch/statement.pdf",
  };
}

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
    const doc = await extractPdfDocument(extractInput(buffer));
    expect(doc.hasTextLayer).toBe(true);
    expect(doc.pageCount).toBeGreaterThanOrEqual(3);
    expect(doc.pages[0].lines.length).toBeGreaterThan(5);
  });

  it("throws no_text_layer for an image-only PDF", async () => {
    const buffer = await buildNoTextLayerPdf();
    await expect(extractPdfDocument(extractInput(buffer))).rejects.toMatchObject({ code: "no_text_layer" });
  });

  it("throws password_protected_pdf for a real encrypted PDF", async () => {
    const buffer = await buildPasswordProtectedPdf();
    await expect(extractPdfDocument(extractInput(buffer))).rejects.toMatchObject({ code: "password_protected_pdf" });
  });

  it("throws malformed_pdf for a corrupted document", async () => {
    const buffer = buildMalformedPdf();
    await expect(extractPdfDocument(extractInput(buffer))).rejects.toMatchObject({ code: "malformed_pdf" });
  });

  it("passes uploaded bytes to pdfjs as a Uint8Array data source, not a numeric path", async () => {
    const source = readFileSync(join(process.cwd(), "src/lib/import/pdf/pdf-text-extractor.ts"), "utf8");
    expect(source).toContain("getDocument(pdfSource)");
    expect(source).toContain("data: bytes");
    expect(source).not.toContain("createRequire(import.meta.url)");
    expect(source).not.toContain("readFile");
  });

  it("does not use numeric file size as a filesystem path", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/import/pdf/index.ts"), "utf8");
    expect(source).toContain("fileSize");
    expect(source).not.toMatch(/readFile\([^)]*fileSize/);
    expect(source).not.toMatch(/path\.(resolve|join)\([^)]*fileSize/);
  });
});

describe("page normalization", () => {
  it("strips repeated header lines from pages after the first", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const raw = await extractPdfDocument(extractInput(buffer));
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
    const doc = normalizeExtractedDocument(await extractPdfDocument(extractInput(buffer)));
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
    const doc = normalizeExtractedDocument(await extractPdfDocument(extractInput(buffer)));
    const layout = detectGenericLayout(doc);
    expect(layout.layoutId).toBe("A");
    expect(layout.confidence).toBeGreaterThan(0.4);
    expect(layout.columns.some((c) => c.role === "debit")).toBe(true);
    expect(layout.columns.some((c) => c.role === "credit")).toBe(true);
    expect(layout.columns.some((c) => c.role === "balance")).toBe(true);
  });

  it("returns unsupported for a non-tabular document", async () => {
    const buffer = await buildUnsupportedLayoutPdf();
    const doc = normalizeExtractedDocument(await extractPdfDocument(extractInput(buffer)));
    const layout = detectGenericLayout(doc);
    expect(layout.layoutId).toBe("unsupported");
  });
});

describe("full deterministic pipeline", () => {
  it("parses 30+ rows from the generated statement", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
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
    const result = await parsePdfStatement(parseInput(buffer));
    const merged = result.rows.find((r) => r.description.includes("GRAB*FOOD"));
    expect(merged).toBeDefined();
    expect(merged?.description).toContain("BANGKOK TH");
  });

  it("infers the missing year from the statement period", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
    const inferredRow = result.rows.find((r) => (r.rawData as { validationWarnings?: string[] })?.validationWarnings?.some((w) => w.includes("อนุมานปี")));
    expect(inferredRow).toBeDefined();
    expect(inferredRow?.occurredAt.slice(0, 4)).toBe("2026");
  });

  it("rejects an unsupported-layout document with a Thai fallback message", async () => {
    const buffer = await buildUnsupportedLayoutPdf();
    await expect(parsePdfStatement(parseInput(buffer))).rejects.toMatchObject({ code: "unsupported_layout" });
  });

  it("rejects a password-protected PDF with a Thai message", async () => {
    const buffer = await buildPasswordProtectedPdf();
    try {
      await parsePdfStatement(parseInput(buffer));
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
    const resultA = await parsePdfStatement(parseInput(buffer));
    const resultB = await parsePdfStatement(parseInput(buffer));

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
    const doc = normalizeExtractedDocument(await extractPdfDocument(extractInput(buffer)));
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

describe("pdf production runtime compatibility", () => {
  it("externalizes PDF.js and native canvas packages from the Next server bundle", () => {
    expect(nextConfig.serverExternalPackages).toEqual(
      expect.arrayContaining(["pdfjs-dist", "@napi-rs/canvas"]),
    );
  });

  it("keeps history import routes on the Node runtime", () => {
    const uploadPage = readFileSync(join(process.cwd(), "src/app/history-import/page.tsx"), "utf8");
    const reviewPage = readFileSync(
      join(process.cwd(), "src/app/history-import/[batchId]/review/page.tsx"),
      "utf8",
    );
    const summaryPage = readFileSync(
      join(process.cwd(), "src/app/history-import/[batchId]/summary/page.tsx"),
      "utf8",
    );

    expect(uploadPage).toContain('export const runtime = "nodejs"');
    expect(reviewPage).toContain('export const runtime = "nodejs"');
    expect(summaryPage).toContain('export const runtime = "nodejs"');
  });

  it("resolves the native canvas package PDF.js uses for Node DOM polyfills", async () => {
    const canvas = await import("@napi-rs/canvas");
    expect(canvas.DOMMatrix).toBeTypeOf("function");
    expect(canvas.ImageData).toBeTypeOf("function");
    expect(canvas.Path2D).toBeTypeOf("function");
  });

  it("loads PDF.js in Node and extracts text from an uploaded-byte Uint8Array", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    expect(pdfjs.getDocument).toBeTypeOf("function");

    const buffer = await buildGenericBankStatementPdf();
    const doc = await extractPdfDocument(extractInput(buffer));

    expect(doc.hasTextLayer).toBe(true);
    expect(doc.pages.some((page) => page.rawText.includes("KBank"))).toBe(true);
  });

  it("uses getTextContent without invoking canvas rendering", async () => {
    vi.resetModules();

    const getTextContent = vi.fn(async () => ({
      items: [
        { str: "Statement text layer", transform: [1, 0, 0, 1, 10, 20] },
        { str: "deterministic extraction", transform: [1, 0, 0, 1, 10, 10] },
      ],
    }));
    const render = vi.fn();
    const getPage = vi.fn(async () => ({ getTextContent, render }));
    const destroy = vi.fn(async () => undefined);
    const getDocument = vi.fn(() => ({
      promise: Promise.resolve({ numPages: 1, getPage, destroy }),
    }));

    vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
      getDocument,
      GlobalWorkerOptions: { workerSrc: "" },
    }));

    try {
      const { extractPdfDocument: mockedExtractPdfDocument } = await import(
        "@/lib/import/pdf/pdf-text-extractor"
      );
      const bytes = new Uint8Array([37, 80, 68, 70]);
      const doc = await mockedExtractPdfDocument({ bytes });

      expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ data: bytes }));
      expect(getPage).toHaveBeenCalledWith(1);
      expect(getTextContent).toHaveBeenCalledOnce();
      expect(render).not.toHaveBeenCalled();
      expect(doc.hasTextLayer).toBe(true);
    } finally {
      vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
      vi.resetModules();
    }
  });

  it("keeps the statement extractor free of canvas rendering calls", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/import/pdf/pdf-text-extractor.ts"), "utf8");

    expect(source).toContain("page.getTextContent()");
    expect(source).not.toMatch(/\.render\s*\(/);
    expect(source).not.toContain("CanvasFactory");
    expect(source).not.toContain("createCanvas");
  });
});

describe("real-world compact-header statement layout (fix/pdf-real-statement-layout)", () => {
  // This fixture reproduces (with entirely fictional data) the structural
  // characteristics of a real production statement that previously failed
  // with unsupported_layout:
  //   1. A long bank letterhead/account-info preamble (14+ lines) before
  //      the transaction table header, beyond the old fixed header search
  //      window.
  //   2. Debit/Credit header labels close enough together to merge into a
  //      single detected column under the old column-gap threshold,
  //      losing the "credit" role entirely.
  //   3. Data amounts landing in two well-separated x sub-positions despite
  //      that header ambiguity, which the new column-split logic recovers.

  it("parses the sanitized layout successfully with all 25 rows", async () => {
    const buffer = await buildCompactHeaderStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
    expect(result.rows.length).toBe(25);
  });

  it("maps dates correctly, including 2-digit Buddhist years", async () => {
    const buffer = await buildCompactHeaderStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
    for (const row of result.rows) {
      expect(row.occurredAt.slice(0, 4)).toBe("2026");
      expect(row.occurredAt.slice(5, 7)).toBe("07");
    }
  });

  it("maps amounts correctly as integer satang", async () => {
    const buffer = await buildCompactHeaderStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
    result.rows.forEach((row, i) => {
      const expectedAmountSatang = 12000 + (i + 1) * 900;
      expect(row.amountSatang).toBe(expectedAmountSatang);
      expect(Number.isInteger(row.amountSatang)).toBe(true);
    });
  });

  it("resolves debit/credit direction correctly from the split shared column", async () => {
    const buffer = await buildCompactHeaderStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
    const directionCounts: Record<string, number> = {};
    result.rows.forEach((r) => {
      directionCounts[r.direction] = (directionCounts[r.direction] ?? 0) + 1;
    });
    // Fixture: credit on every 5th row (i % 5 === 0) out of 25 rows.
    expect(directionCounts.credit).toBe(5);
    expect(directionCounts.debit).toBe(20);
    expect(directionCounts.unknown ?? 0).toBe(0);

    result.rows.forEach((row, i) => {
      const expectedDirection = (i + 1) % 5 === 0 ? "credit" : "debit";
      expect(row.direction).toBe(expectedDirection);
    });
  });

  it("ignores repeated page headers/footers instead of producing spurious rows", async () => {
    const buffer = await buildCompactHeaderStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
    // rowsPerPage=14 over 25 rows spans 2 pages with a repeated header line;
    // exactly 25 rows (not 26+) confirms the repeated header wasn't parsed
    // as a transaction.
    expect(result.pageCount).toBe(2);
    expect(result.rows.length).toBe(25);
    expect(result.rows.every((r) => r.description.length > 0)).toBe(true);
  });

  it("produces zero validation warnings and a populated running balance for every row", async () => {
    const buffer = await buildCompactHeaderStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
    result.rows.forEach((row) => {
      const rawData = row.rawData as { validationWarnings?: string[] } | undefined;
      expect(rawData?.validationWarnings ?? []).toEqual([]);
      expect(row.runningBalanceSatang).toBeTypeOf("number");
    });
  });

  it("detects the header well beyond the old 10-line search window", async () => {
    const buffer = await buildCompactHeaderStatementPdf();
    const doc = normalizeExtractedDocument(await extractPdfDocument(extractInput(buffer)));
    const layout = detectGenericLayout(doc);
    expect(layout.layoutId).not.toBe("unsupported");
    expect(layout.headerLineIndex).toBeGreaterThanOrEqual(10);
  });

  it("still rejects a genuinely unsupported (non-tabular) layout", async () => {
    const buffer = await buildUnsupportedLayoutPdf();
    await expect(parsePdfStatement(parseInput(buffer))).rejects.toMatchObject({ code: "unsupported_layout" });
  });

  it("still rejects malformed, no-text-layer, and password-protected PDFs unchanged", async () => {
    await expect(parsePdfStatement(parseInput(buildMalformedPdf()))).rejects.toMatchObject({
      code: "malformed_pdf",
    });
    await expect(parsePdfStatement(parseInput(await buildNoTextLayerPdf()))).rejects.toMatchObject({
      code: "no_text_layer",
    });
    await expect(parsePdfStatement(parseInput(await buildPasswordProtectedPdf()))).rejects.toMatchObject({
      code: "password_protected_pdf",
    });
  });

  it("still parses the original generic layout (layout A) unchanged", async () => {
    const buffer = await buildGenericBankStatementPdf();
    const result = await parsePdfStatement(parseInput(buffer));
    expect(result.rows.length).toBeGreaterThanOrEqual(30);
  });

  it("unsupported_layout errors carry safe structural diagnostics only, never row content", async () => {
    const buffer = await buildUnsupportedLayoutPdf();
    try {
      await parsePdfStatement(parseInput(buffer));
      throw new Error("expected parsePdfStatement to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(PdfImportError);
      const stack = (err as PdfImportError).stack ?? "";
      expect(stack).toMatch(/pageCount=\d+/);
      expect(stack).toMatch(/candidateColumnCount=\d+/);
      expect(stack).toMatch(/reason=/);
    }
  });
});
