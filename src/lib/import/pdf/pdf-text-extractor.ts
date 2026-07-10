import { PdfImportError, type ExtractedDocument, type ExtractedLine, type ExtractedPage, type ExtractedTextItem } from "./types";
import { assertReasonablePageCount } from "./pdf-file-validator";

// Line items whose baselines fall within this many PDF points of each other are
// treated as the same visual row (handles slight sub-pixel baseline jitter).
const LINE_Y_TOLERANCE = 2.5;
// Roughly a typical 10pt-font glyph width; used to translate horizontal gaps
// between text items into a proportional number of reconstructed spaces so
// wide table gutters remain splittable via `/\s{2,}/`.
const APPROX_CHAR_WIDTH = 4.5;

let workerConfigured = false;

export async function extractPdfDocument({ bytes }: { bytes: Uint8Array }): Promise<ExtractedDocument> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!workerConfigured) {
    const { createRequire } = await import("node:module");
    const { join } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const require = createRequire(join(process.cwd(), "package.json"));
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    workerConfigured = true;
  }

  let doc;
  try {
    const pdfSource = {
      data: bytes,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0,
    } as unknown as Parameters<typeof getDocument>[0];
    const loadingTask = getDocument(pdfSource);
    doc = await loadingTask.promise;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "development") {
      console.error("PDF text extraction failed", { name, message });
    }
    if (name === "PasswordException") {
      throw new PdfImportError("password_protected_pdf", message);
    }
    if (name === "InvalidPDFException") {
      throw new PdfImportError("malformed_pdf", message);
    }
    throw new PdfImportError("extraction_failed", message);
  }

  try {
    assertReasonablePageCount(doc.numPages);

    const pages: ExtractedPage[] = [];
    let totalChars = 0;

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const warnings: string[] = [];
      let content;
      try {
        content = await page.getTextContent();
      } catch {
        warnings.push(`อ่านข้อความหน้า ${pageNumber} ไม่สำเร็จ`);
        pages.push({ pageNumber, rawText: "", lines: [], warnings });
        continue;
      }

      const items: ExtractedTextItem[] = [];
      for (const raw of content.items) {
        if (!("str" in raw) || typeof raw.str !== "string") continue;
        const str = raw.str;
        if (str.trim().length === 0) continue;
        const transform = (raw as { transform: number[] }).transform;
        items.push({ text: str, x: transform[4], y: transform[5] });
        totalChars += str.trim().length;
      }

      pages.push({ pageNumber, ...buildLines(items), warnings });
    }

    const hasTextLayer = totalChars >= 20;
    if (!hasTextLayer) {
      throw new PdfImportError("no_text_layer");
    }

    return { pageCount: doc.numPages, pages, hasTextLayer };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

function buildLines(items: ExtractedTextItem[]): { rawText: string; lines: ExtractedLine[] } {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: ExtractedTextItem[][] = [];
  for (const item of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= LINE_Y_TOLERANCE);
    if (row) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }

  const lines: ExtractedLine[] = rows.map((rowItems, lineIndex) => {
    const sortedRow = [...rowItems].sort((a, b) => a.x - b.x);
    let text = "";
    let cursorX: number | null = null;
    for (const item of sortedRow) {
      if (cursorX !== null) {
        const gap = item.x - cursorX;
        const spaceCount = gap > APPROX_CHAR_WIDTH ? Math.min(20, Math.round(gap / APPROX_CHAR_WIDTH)) : 1;
        text += " ".repeat(Math.max(1, spaceCount));
      }
      text += item.text;
      cursorX = item.x + item.text.length * APPROX_CHAR_WIDTH;
    }
    return {
      lineIndex,
      y: sortedRow[0].y,
      text: text.trim(),
      items: sortedRow,
    };
  });

  return { rawText: lines.map((l) => l.text).join("\n"), lines };
}
