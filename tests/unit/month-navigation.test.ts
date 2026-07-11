import { describe, expect, it } from "vitest";
import {
  formatBangkokMonthLabel,
  resolveBangkokMonthQuery,
  shiftMonth,
} from "@/lib/finance/date";
import { getImportSummaryTransactionMonth } from "@/lib/import/summary-navigation";
import type { ImportBatch, ImportRow } from "@/types/domain";

const batch = {
  periodStart: "2026-04-01",
  periodEnd: "2026-04-30",
  statementDate: undefined,
} satisfies Pick<ImportBatch, "periodStart" | "periodEnd" | "statementDate">;

function row(overrides: Partial<ImportRow>): ImportRow {
  return {
    id: "row-1",
    userId: "user-1",
    importBatchId: "batch-1",
    sourceRowIndex: 0,
    occurredAt: "2026-05-10T10:00:00+07:00",
    description: "Imported May 2026 Test",
    amountSatang: 12345,
    direction: "debit",
    currency: "THB",
    duplicateScore: 0,
    reviewStatus: "imported",
    importDecision: "import",
    validationWarnings: [],
    parserSource: "deterministic",
    createdAt: "2026-05-10T10:00:00+07:00",
    updatedAt: "2026-05-10T10:00:00+07:00",
    ...overrides,
  };
}

describe("transaction month navigation", () => {
  it("defaults to the current Bangkok month when the query is absent", () => {
    expect(resolveBangkokMonthQuery(undefined, new Date("2026-07-10T20:00:00Z"))).toBe("2026-07");
  });

  it("accepts a strict historical YYYY-MM query", () => {
    expect(resolveBangkokMonthQuery("2026-05", new Date("2026-07-10T20:00:00Z"))).toBe("2026-05");
  });

  it("falls back safely for invalid month values", () => {
    expect(resolveBangkokMonthQuery("2026-5", new Date("2026-07-10T20:00:00Z"))).toBe("2026-07");
    expect(resolveBangkokMonthQuery("2026-13", new Date("2026-07-10T20:00:00Z"))).toBe("2026-07");
    expect(resolveBangkokMonthQuery(["2026-05"], new Date("2026-07-10T20:00:00Z"))).toBe("2026-07");
  });

  it("calculates previous and next month links across year boundaries", () => {
    expect(shiftMonth("2026-05", -1)).toBe("2026-04");
    expect(shiftMonth("2026-05", 1)).toBe("2026-06");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("formats selected months with Thai month names and Gregorian years", () => {
    expect(formatBangkokMonthLabel("2026-05")).toContain("พฤษภาคม");
    expect(formatBangkokMonthLabel("2026-05")).toContain("2026");
  });
});

describe("history import summary transaction link month", () => {
  it("links to the latest imported transaction month in a batch", () => {
    expect(
      getImportSummaryTransactionMonth({
        rows: [
          row({ id: "row-apr", occurredAt: "2026-04-30T10:00:00+07:00" }),
          row({ id: "row-may", occurredAt: "2026-05-01T10:00:00+07:00" }),
        ],
        batch,
        fallbackMonth: "2026-07",
      }),
    ).toBe("2026-05");
  });

  it("ignores skipped rows and falls back to batch period metadata", () => {
    expect(
      getImportSummaryTransactionMonth({
        rows: [row({ reviewStatus: "skipped", importDecision: "skip", occurredAt: "2026-05-01T10:00:00+07:00" })],
        batch,
        fallbackMonth: "2026-07",
      }),
    ).toBe("2026-04");
  });

  it("proves imported May 2026 rows resolve to the May transaction URL month", () => {
    const month = getImportSummaryTransactionMonth({
      rows: [row({ occurredAt: "2026-05-15T09:00:00+07:00" })],
      batch,
      fallbackMonth: "2026-07",
    });

    expect(`/transactions?month=${month}&importBatchId=batch-1`).toBe("/transactions?month=2026-05&importBatchId=batch-1");
  });
});
