import type { DetectedLayout, ExtractedDocument, ExtractedLine, ExtractedTextItem } from "./types";

export interface GroupedRow {
  pageNumber: number;
  sourceLineStart: number;
  sourceLineEnd: number;
  text: string;
  items: ExtractedTextItem[];
  continuationLineCount: number;
}

const DATE_START_WITH_YEAR = new RegExp(
  "^\\d{1,2}\\s*[/\\-]\\s*\\d{1,2}\\s*[/\\-]\\s*\\d{2,4}|^\\d{4}-\\d{2}-\\d{2}|^\\d{1,2}\\s+(?:ม\\.?ค|ก\\.?พ|มี\\.?ค|เม\\.?ย|พ\\.?ค|มิ\\.?ย|ก\\.?ค|ส\\.?ค|ก\\.?ย|ต\\.?ค|พ\\.?ย|ธ\\.?ค)\\.?\\s*\\d{2,4}|^\\d{1,2}\\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s+\\d{2,4}",
  "i",
);

// A day/month pair with no year suffix, e.g. "12/07" — the parser infers the
// year from the statement period (see generic-statement-parser.ts).
const DATE_START_NO_YEAR = /^\d{1,2}\s*[/\-]\s*\d{1,2}(?!\s*[/\-]\s*\d)/;

export function lineStartsWithDate(text: string): boolean {
  const trimmed = text.trim();
  return DATE_START_WITH_YEAR.test(trimmed) || DATE_START_NO_YEAR.test(trimmed);
}

/**
 * Merges continuation lines (wrapped merchant names, multiline descriptions)
 * into the row they belong to. A new row starts whenever a line begins with a
 * recognizable date token; every following line up to the next date-led line
 * is treated as a continuation of the same transaction.
 */
export function groupContinuationLines(doc: ExtractedDocument, layout: DetectedLayout): GroupedRow[] {
  const rows: GroupedRow[] = [];

  for (const page of doc.pages) {
    for (const line of page.lines) {
      const isHeader = page.pageNumber === layout.headerPageNumber && line.lineIndex === layout.headerLineIndex;
      if (isHeader) continue;
      if (!line.text) continue;

      if (lineStartsWithDate(line.text)) {
        rows.push({
          pageNumber: page.pageNumber,
          sourceLineStart: line.lineIndex,
          sourceLineEnd: line.lineIndex,
          text: line.text,
          items: [...line.items],
          continuationLineCount: 0,
        });
        continue;
      }

      // Not date-led: it's a continuation of the previous row (possibly
      // carried across a page boundary). Stray text before any row has
      // opened (titles, disclaimers) is skipped rather than inventing a row.
      if (rows.length === 0) continue;

      const last = rows[rows.length - 1];
      last.text += ` ${line.text}`;
      last.items.push(...line.items);
      last.sourceLineEnd = line.lineIndex;
      last.continuationLineCount += 1;
    }
  }

  return rows;
}

export function isLikelyContinuation(line: ExtractedLine): boolean {
  return !lineStartsWithDate(line.text);
}
