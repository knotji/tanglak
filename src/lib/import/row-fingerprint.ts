import { createHash } from "crypto";
import type { ParsedTransaction } from "./types";

function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic identity for a staging row, independent of insertion order.
 * Used to detect duplicate staging inserts across retries of the same batch
 * (e.g. a page got re-extracted in a different order), which a plain
 * `source_row_index` uniqueness check would not catch.
 */
export function computeRowFingerprint(batchId: string, row: ParsedTransaction): string {
  const dateOnly = row.occurredAt.slice(0, 10);
  const parts = [
    batchId,
    row.pageNumber ?? "",
    row.sourceLineStart ?? "",
    row.sourceLineEnd ?? "",
    dateOnly,
    row.amountSatang,
    row.direction,
    normalizeDescription(row.description),
    row.referenceNumber ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
