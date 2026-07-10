import type { ExtractedDocument, ExtractedLine, ExtractedPage } from "./types";

const HEADER_FOOTER_ZONE = 6;
const NBSP = String.fromCharCode(160);

// Multi-space runs are intentionally preserved (not collapsed) - the layout
// detector and row parser rely on wide gaps to tell table columns apart from
// single-space word breaks within a cell.
function normalizeWhitespace(text: string): string {
  return text
    .normalize("NFC")
    .split(NBSP)
    .join(" ")
    .replace(/\t/g, "    ")
    .replace(/\r\n/g, "\n")
    .replace(/ +$/, "")
    .replace(/^ +/, "");
}

function normalizeLine(line: ExtractedLine): ExtractedLine {
  return { ...line, text: normalizeWhitespace(line.text) };
}

/**
 * Bank statement PDFs commonly repeat a bank/account header and a
 * "Page X of Y" footer on every page. Those lines would otherwise get
 * misread as transaction rows, so we detect and drop repeats (keeping the
 * first occurrence for metadata/layout detection).
 */
function findRepeatedZoneLines(pages: ExtractedPage[]): Set<string> {
  if (pages.length < 2) return new Set();

  const counts = new Map<string, number>();
  for (const page of pages) {
    const zoneLines = new Set([
      ...page.lines.slice(0, HEADER_FOOTER_ZONE).map((l) => l.text),
      ...page.lines.slice(-HEADER_FOOTER_ZONE).map((l) => l.text),
    ]);
    for (const text of zoneLines) {
      if (!text) continue;
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }

  const repeated = new Set<string>();
  for (const [text, count] of counts) {
    if (count >= Math.max(2, Math.ceil(pages.length * 0.6))) {
      repeated.add(text);
    }
  }
  return repeated;
}

export function normalizeExtractedDocument(doc: ExtractedDocument): ExtractedDocument {
  const normalizedPages = doc.pages.map((page) => ({
    ...page,
    rawText: normalizeWhitespace(page.rawText),
    lines: page.lines.map(normalizeLine),
  }));

  const repeated = findRepeatedZoneLines(normalizedPages);
  let keptFirstOccurrence = new Set<string>();

  const cleanedPages = normalizedPages.map((page) => {
    const lines = page.lines.filter((line) => {
      if (!repeated.has(line.text)) return true;
      if (!keptFirstOccurrence.has(line.text)) {
        keptFirstOccurrence.add(line.text);
        return true;
      }
      return false;
    });
    return { ...page, lines };
  });

  keptFirstOccurrence = new Set();
  return { ...doc, pages: cleanedPages };
}
