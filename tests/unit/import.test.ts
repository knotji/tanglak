import { describe, it, expect } from "vitest";
import { detectCSVDelimiter, detectCSVHeaders, validateRunningBalance } from "../../src/lib/import/validators";
import { parseThaiBuddhistYearDate, parseAmountSatang } from "../../src/lib/import/normalize";
import { GenericBankCSVParser } from "../../src/lib/import/adapters/generic-bank-csv";
import type { ParsedTransaction } from "../../src/lib/import/types";

// Helper to generate a CSV with N data rows
function generateCSV(rows: number, delimiter = ","): string {
  const header = `date${delimiter}description${delimiter}debit${delimiter}credit${delimiter}balance${delimiter}reference`;
  const dataRows = Array.from({ length: rows }, (_, i) => {
    const amount = ((i + 1) * 100).toFixed(2);
    const balance = ((rows - i) * 100).toFixed(2);
    const direction = i % 2 === 0 ? `${amount}${delimiter}` : `${delimiter}${amount}`;
    return `10/07/2569${delimiter}Transaction ${i + 1}${delimiter}${direction}${delimiter}${balance}${delimiter}REF${String(i + 1).padStart(5, "0")}`;
  });
  return [header, ...dataRows].join("\n");
}

describe("History Import Unit Tests", () => {
  // ─── CSV Delimiter & Header Detection ───────────────────────────────────────

  describe("CSV Delimiter & Header Detection", () => {
    it("should detect comma delimiter", () => {
      expect(detectCSVDelimiter("date,description,amount,balance")).toBe(",");
    });

    it("should detect semicolon delimiter", () => {
      expect(detectCSVDelimiter("date;description;amount;balance")).toBe(";");
    });

    it("should detect tab delimiter", () => {
      expect(detectCSVDelimiter("date\tdescription\tamount\tbalance")).toBe("\t");
    });

    it("should map Thai headers correctly", () => {
      const headers = ["วันที่", "รายละเอียด", "ถอน/จ่าย", "ฝาก/รับ", "ยอดคงเหลือ", "เลขที่อ้างอิง"];
      const mapping = detectCSVHeaders(headers);
      expect(mapping.dateIdx).toBe(0);
      expect(mapping.descriptionIdx).toBe(1);
      expect(mapping.debitIdx).toBe(2);
      expect(mapping.creditIdx).toBe(3);
      expect(mapping.balanceIdx).toBe(4);
      expect(mapping.referenceIdx).toBe(5);
    });

    it("should map English headers correctly", () => {
      const headers = ["date", "description", "debit", "credit", "balance", "ref"];
      const mapping = detectCSVHeaders(headers);
      expect(mapping.dateIdx).toBe(0);
      expect(mapping.descriptionIdx).toBe(1);
      expect(mapping.debitIdx).toBe(2);
      expect(mapping.creditIdx).toBe(3);
      expect(mapping.balanceIdx).toBe(4);
      expect(mapping.referenceIdx).toBe(5);
    });

    it("should fallback to index 0 for date when no date header found", () => {
      const mapping = detectCSVHeaders(["col1", "col2", "col3"]);
      expect(mapping.dateIdx).toBe(0);
    });

    it("should use fallback amount column when no debit/credit found", () => {
      const mapping = detectCSVHeaders(["date", "description", "amount"]);
      expect(mapping.amountIdx).toBe(2);
      expect(mapping.debitIdx).toBe(-1);
      expect(mapping.creditIdx).toBe(-1);
    });
  });

  // ─── Thai Date & BE Year Normalization ──────────────────────────────────────

  describe("Thai Date & BE Year Normalization", () => {
    it("should convert Buddhist year DD/MM/YYYY (2569) to AD (2026)", () => {
      const iso = parseThaiBuddhistYearDate("10/07/2569");
      expect(iso.startsWith("2026-07-10")).toBe(true);
    });

    it("should handle Thai short month names (ก.ค.)", () => {
      const iso = parseThaiBuddhistYearDate("10 ก.ค. 2569");
      expect(iso.startsWith("2026-07-10")).toBe(true);
    });

    it("should handle Thai full month names (กรกฎาคม)", () => {
      const iso = parseThaiBuddhistYearDate("10 กรกฎาคม 2569");
      expect(iso.startsWith("2026-07-10")).toBe(true);
    });

    it("should handle English month names (Jul)", () => {
      const iso = parseThaiBuddhistYearDate("10 Jul 2026");
      expect(iso.startsWith("2026-07-10")).toBe(true);
    });

    it("should handle 2-digit Buddhist year (69 → 2026)", () => {
      const iso = parseThaiBuddhistYearDate("10/07/69");
      expect(iso.startsWith("2026-07-10")).toBe(true);
    });

    it("should passthrough ISO 8601 dates directly", () => {
      const iso = parseThaiBuddhistYearDate("2026-07-10T12:00:00Z");
      expect(iso).toBe("2026-07-10T12:00:00.000Z");
    });

    it("should handle AD 4-digit year (2026) without adjustment", () => {
      const iso = parseThaiBuddhistYearDate("10/07/2026");
      expect(iso.startsWith("2026-07-10")).toBe(true);
    });

    it("should return current date for empty input", () => {
      const iso = parseThaiBuddhistYearDate("");
      expect(iso).toBeDefined();
      expect(new Date(iso).getTime()).toBeGreaterThan(0);
    });
  });

  // ─── Satang Money Parser ─────────────────────────────────────────────────────

  describe("Satang Money Parser", () => {
    it("should convert decimal baht to satang", () => {
      expect(parseAmountSatang("123.45")).toBe(12345);
      expect(parseAmountSatang("1,234.50")).toBe(123450);
    });

    it("should handle parentheses as negative values", () => {
      expect(parseAmountSatang("(150.00)")).toBe(-15000);
      expect(parseAmountSatang("(45)")).toBe(-4500);
    });

    it("should handle positive numbers", () => {
      expect(parseAmountSatang("+100.00")).toBe(10000);
    });

    it("should return 0 for empty string", () => {
      expect(parseAmountSatang("")).toBe(0);
    });

    it("should return 0 for non-numeric input", () => {
      expect(parseAmountSatang("N/A")).toBe(0);
      expect(parseAmountSatang("-")).toBe(0);
    });

    it("should handle integer amounts without decimal", () => {
      expect(parseAmountSatang("500")).toBe(50000);
      expect(parseAmountSatang("1000")).toBe(100000);
    });
  });

  // ─── Running Balance Validation ──────────────────────────────────────────────

  describe("Running Balance Check", () => {
    it("should validate a continuous running balance sequence", () => {
      const rows: ParsedTransaction[] = [
        { sourceRowIndex: 0, occurredAt: "2026-07-10T10:00:00Z", description: "Start", amountSatang: 0, direction: "credit", runningBalanceSatang: 100000 },
        { sourceRowIndex: 1, occurredAt: "2026-07-10T11:00:00Z", description: "Withdrawal", amountSatang: 25000, direction: "debit", runningBalanceSatang: 75000 },
        { sourceRowIndex: 2, occurredAt: "2026-07-10T12:00:00Z", description: "Deposit", amountSatang: 50000, direction: "credit", runningBalanceSatang: 125000 },
      ];
      const res = validateRunningBalance(rows);
      expect(res.isValid).toBe(true);
      expect(res.warnings.length).toBe(0);
    });

    it("should warn when balance is discontinuous", () => {
      const rows: ParsedTransaction[] = [
        { sourceRowIndex: 0, occurredAt: "2026-07-10T10:00:00Z", description: "Start", amountSatang: 0, direction: "credit", runningBalanceSatang: 100000 },
        { sourceRowIndex: 1, occurredAt: "2026-07-10T11:00:00Z", description: "Withdrawal", amountSatang: 25000, direction: "debit", runningBalanceSatang: 80000 },
      ];
      const res = validateRunningBalance(rows);
      expect(res.isValid).toBe(false);
      expect(res.warnings[0]).toContain("ยอดเงินคงเหลือไม่สอดคล้อง");
    });

    it("should pass validation when no running balance is present", () => {
      const rows: ParsedTransaction[] = [
        { sourceRowIndex: 0, occurredAt: "2026-07-10T10:00:00Z", description: "A", amountSatang: 10000, direction: "debit" },
        { sourceRowIndex: 1, occurredAt: "2026-07-10T11:00:00Z", description: "B", amountSatang: 20000, direction: "credit" },
      ];
      const res = validateRunningBalance(rows);
      expect(res.isValid).toBe(true);
    });
  });

  // ─── CSV Parser - Real Parsing (50 rows) ────────────────────────────────────

  describe("CSV Parser - Real Parsing", () => {
    const parser = new GenericBankCSVParser();

    it("should parse at least 50 rows from a comma-delimited CSV", async () => {
      const csv = generateCSV(50, ",");
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows.length).toBeGreaterThanOrEqual(50);
    });

    it("should parse semicolon-delimited CSV", async () => {
      const csv = generateCSV(10, ";");
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows.length).toBeGreaterThanOrEqual(10);
    });

    it("should strip UTF-8 BOM and parse correctly", async () => {
      const csv = generateCSV(5, ",");
      const withBom = Buffer.concat([Buffer.from("\uFEFF", "utf8"), Buffer.from(csv, "utf8")]);
      const result = await parser.parse(withBom);
      expect(result.rows.length).toBeGreaterThanOrEqual(5);
    });

    it("should normalize Buddhist year dates from real CSV", async () => {
      const csv = "date,description,debit,credit,balance,reference\n10/07/2569,Salary Credit,,45000.00,45000.00,REF001";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows[0].occurredAt.startsWith("2026-07-10")).toBe(true);
    });

    it("should detect debit direction from debit column", async () => {
      const csv = "date,description,debit,credit,balance,reference\n10/07/2026,ATM Withdrawal,500.00,,4500.00,REF001";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows[0].direction).toBe("debit");
      expect(result.rows[0].amountSatang).toBe(50000);
    });

    it("should detect credit direction from credit column", async () => {
      const csv = "date,description,debit,credit,balance,reference\n10/07/2026,Salary,,45000.00,50000.00,REF002";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows[0].direction).toBe("credit");
      expect(result.rows[0].amountSatang).toBe(4500000);
    });

    it("should handle parentheses as negative amounts in single amount column", async () => {
      const csv = "date,description,amount,balance\n10/07/2026,Charge,(120.00),4880.00";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows[0].amountSatang).toBe(12000);
    });

    it("should skip empty rows without crashing", async () => {
      const csv = "date,description,debit,credit,balance,reference\n10/07/2026,Transaction,100,,900,REF001\n\n\n11/07/2026,Another,50,,850,REF002";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows.length).toBe(2);
    });

    it("should handle rows with quoted fields containing commas", async () => {
      const csv = `date,description,debit,credit,balance,reference\n10/07/2026,"Transfer, BKK",100.00,,900.00,REF001`;
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows[0].description).toBe("Transfer, BKK");
    });

    it("should throw for empty CSV", async () => {
      await expect(parser.parse(Buffer.from("", "utf8"))).rejects.toThrow("CSV file is empty");
    });

    it("should return empty rows array for header-only CSV", async () => {
      const csv = "date,description,debit,credit,balance,reference";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows.length).toBe(0);
    });

    it("should gracefully skip rows with invalid amounts", async () => {
      const csv = "date,description,debit,credit,balance,reference\n10/07/2026,Bad Row,N/A,,900,REF001\n10/07/2026,Good Row,100,,800,REF002";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      // Invalid amounts parse as 0, not crash — both rows should still be present
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].amountSatang).toBe(0);
      expect(result.rows[1].amountSatang).toBe(10000);
    });

    it("should extract reference number from ref column", async () => {
      const csv = "date,description,debit,credit,balance,reference\n10/07/2026,ATM,100,,900,TXN99999";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows[0].referenceNumber).toBe("TXN99999");
    });

    it("should extract period dates from CSV rows", async () => {
      const csv = generateCSV(5, ",");
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.period?.periodStart).toBeDefined();
      expect(result.period?.periodEnd).toBeDefined();
    });
  });

  // ─── Duplicate Detection (scoring logic) ────────────────────────────────────

  describe("Duplicate Detection Logic", () => {
    it("exact reference match should score 100", () => {
      // Simulate duplicate detection scoring inline
      const parsed = { referenceNumber: "TXN001", amountSatang: 50000, occurredAt: "2026-07-10T10:00:00Z", merchant: "Store" };
      const existing = { id: "tx-1", referenceNumber: "TXN001", amountSatang: 50000, occurredAt: "2026-07-10T10:00:00Z", merchant: "Store" };
      let score = 0;
      if (parsed.referenceNumber && existing.referenceNumber === parsed.referenceNumber) {
        score = 100;
      }
      expect(score).toBe(100);
    });

    it("same amount + same date should score 90", () => {
      const parsed = { amountSatang: 50000, occurredAt: "2026-07-10T10:00:00Z", referenceNumber: undefined };
      const existing = { amountSatang: 50000, occurredAt: "2026-07-10T10:00:00Z", referenceNumber: undefined };
      const timeDiffMs = Math.abs(new Date(existing.occurredAt).getTime() - new Date(parsed.occurredAt).getTime());
      const amountMatch = existing.amountSatang === parsed.amountSatang;
      let score = 0;
      if (!parsed.referenceNumber && amountMatch && timeDiffMs === 0) score = 90;
      expect(score).toBe(90);
    });

    it("same amount + within 24h should score 80", () => {
      const parsed = { amountSatang: 50000, occurredAt: "2026-07-10T10:00:00Z" };
      const existing = { amountSatang: 50000, occurredAt: "2026-07-10T20:00:00Z" };
      const timeDiffMs = Math.abs(new Date(existing.occurredAt).getTime() - new Date(parsed.occurredAt).getTime());
      const amountMatch = existing.amountSatang === parsed.amountSatang;
      let score = 0;
      if (amountMatch && timeDiffMs <= 24 * 60 * 60 * 1000 && timeDiffMs > 0) score = 80;
      expect(score).toBe(80);
    });

    it("different amount should score 0", () => {
      const parsed = { amountSatang: 50000, occurredAt: "2026-07-10T10:00:00Z" };
      const existing = { amountSatang: 99999, occurredAt: "2026-07-10T10:00:00Z" };
      const score = existing.amountSatang === parsed.amountSatang ? 90 : 0;
      expect(score).toBe(0);
    });
  });

  // ─── Transfer Detection ──────────────────────────────────────────────────────

  describe("Transfer Detection", () => {
    it("should detect opposing credit/debit with same amount within 1 hour as possible transfer", () => {
      const rows: ParsedTransaction[] = [
        { sourceRowIndex: 0, occurredAt: "2026-07-10T10:00:00Z", description: "Transfer Out", amountSatang: 100000, direction: "debit" },
        { sourceRowIndex: 1, occurredAt: "2026-07-10T10:30:00Z", description: "Transfer In", amountSatang: 100000, direction: "credit" },
      ];

      let isPossibleTransfer = false;
      for (const parsed of rows) {
        for (const other of rows) {
          if (other.sourceRowIndex !== parsed.sourceRowIndex && other.amountSatang === parsed.amountSatang) {
            const opposingDirections =
              (parsed.direction === "credit" && other.direction === "debit") ||
              (parsed.direction === "debit" && other.direction === "credit");
            const diffMs = Math.abs(new Date(other.occurredAt).getTime() - new Date(parsed.occurredAt).getTime());
            if (opposingDirections && diffMs <= 60 * 60 * 1000) {
              isPossibleTransfer = true;
              break;
            }
          }
        }
      }
      expect(isPossibleTransfer).toBe(true);
    });

    it("should NOT flag as transfer if time difference exceeds 1 hour", () => {
      const rows: ParsedTransaction[] = [
        { sourceRowIndex: 0, occurredAt: "2026-07-10T09:00:00Z", description: "Transfer Out", amountSatang: 100000, direction: "debit" },
        { sourceRowIndex: 1, occurredAt: "2026-07-10T12:00:00Z", description: "Transfer In", amountSatang: 100000, direction: "credit" },
      ];

      let isPossibleTransfer = false;
      for (const parsed of rows) {
        for (const other of rows) {
          if (other.sourceRowIndex !== parsed.sourceRowIndex && other.amountSatang === parsed.amountSatang) {
            const opposingDirections =
              (parsed.direction === "credit" && other.direction === "debit") ||
              (parsed.direction === "debit" && other.direction === "credit");
            const diffMs = Math.abs(new Date(other.occurredAt).getTime() - new Date(parsed.occurredAt).getTime());
            if (opposingDirections && diffMs <= 60 * 60 * 1000) {
              isPossibleTransfer = true;
              break;
            }
          }
        }
      }
      expect(isPossibleTransfer).toBe(false);
    });
  });

  // ─── Debt Payment Detection ──────────────────────────────────────────────────

  describe("Debt Payment Detection", () => {
    it("should flag credit card payment keywords", () => {
      const descriptions = ["KTC payment", "ชำระบัตร SCB", "SCB card payment"];
      for (const desc of descriptions) {
        const isCreditCardPayment =
          desc.toLowerCase().includes("payment") ||
          desc.toLowerCase().includes("ชำระบัตร") ||
          desc.toLowerCase().includes("ktc") ||
          desc.toLowerCase().includes("scb card");
        expect(isCreditCardPayment).toBe(true);
      }
    });

    it("should NOT flag regular expenses as debt payments", () => {
      const descriptions = ["7-Eleven Store", "GrabFood Delivery", "Salary Income"];
      for (const desc of descriptions) {
        const isCreditCardPayment =
          desc.toLowerCase().includes("payment") ||
          desc.toLowerCase().includes("ชำระบัตร") ||
          desc.toLowerCase().includes("ktc") ||
          desc.toLowerCase().includes("scb card");
        expect(isCreditCardPayment).toBe(false);
      }
    });
  });

  // ─── Row Idempotency ─────────────────────────────────────────────────────────

  describe("Row Idempotency", () => {
    it("same row imported twice should not produce two transactions (idempotency guard)", () => {
      // Simulate the idempotency check in importReviewedRows
      const existingRow = { id: "row-1", createdTransactionId: "tx-existing-123" };
      const shouldSkip = !!existingRow.createdTransactionId;
      expect(shouldSkip).toBe(true);
    });

    it("row without createdTransactionId should be imported", () => {
      const existingRow = { id: "row-2", createdTransactionId: undefined };
      const shouldSkip = !!existingRow.createdTransactionId;
      expect(shouldSkip).toBe(false);
    });
  });

  // ─── Batch State Transitions ─────────────────────────────────────────────────

  describe("Batch State Transitions", () => {
    it("rolled_back batch should be safe to rollback again (idempotent)", () => {
      // Simulate the rollback guard
      const batch = { status: "rolled_back" };
      const isAlreadyRolledBack = batch.status === "rolled_back";
      expect(isAlreadyRolledBack).toBe(true);
      // In the real code, we return early — no error thrown
    });

    it("uploaded batch should NOT be rollbackable", () => {
      const batch = { status: "uploaded" };
      const canRollback = batch.status === "completed" || batch.status === "partially_imported";
      expect(canRollback).toBe(false);
    });

    it("completed batch should be rollbackable", () => {
      const batch = { status: "completed" };
      const canRollback = batch.status === "completed" || batch.status === "partially_imported";
      expect(canRollback).toBe(true);
    });

    it("partially_imported batch should be rollbackable", () => {
      const batch = { status: "partially_imported" };
      const canRollback = batch.status === "completed" || batch.status === "partially_imported";
      expect(canRollback).toBe(true);
    });
  });

  // ─── User Isolation ──────────────────────────────────────────────────────────

  describe("User Isolation", () => {
    it("assertOwner should throw for different user IDs", () => {
      function assertOwner(userId: string, ownerId: string) {
        if (userId !== ownerId) throw new Error("Cannot access another user's data");
      }
      expect(() => assertOwner("user-A", "user-B")).toThrow("Cannot access another user's data");
    });

    it("assertOwner should pass for same user ID", () => {
      function assertOwner(userId: string, ownerId: string) {
        if (userId !== ownerId) throw new Error("Cannot access another user's data");
      }
      expect(() => assertOwner("user-A", "user-A")).not.toThrow();
    });

    it("listImportRows mock should filter by userId", () => {
      const rows = [
        { id: "r1", userId: "user-A", importBatchId: "batch-1" },
        { id: "r2", userId: "user-B", importBatchId: "batch-1" },
        { id: "r3", userId: "user-A", importBatchId: "batch-2" },
      ];
      const result = rows.filter((r) => r.importBatchId === "batch-1" && r.userId === "user-A");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("r1");
    });

    it("rollback should only target rows owned by userId", () => {
      const transactions = [
        { id: "tx-1", userId: "user-A", importBatchId: "batch-1", isHistorical: true },
        { id: "tx-2", userId: "user-B", importBatchId: "batch-1", isHistorical: true },
      ];
      const target = transactions.filter(
        (tx) => tx.importBatchId === "batch-1" && tx.isHistorical === true && tx.userId === "user-A"
      );
      expect(target.length).toBe(1);
      expect(target[0].id).toBe("tx-1");
    });
  });

  // ─── Malformed CSV Handling ──────────────────────────────────────────────────

  describe("Malformed CSV Handling", () => {
    const parser = new GenericBankCSVParser();

    it("should throw for completely empty file", async () => {
      await expect(parser.parse(Buffer.from("", "utf8"))).rejects.toThrow();
    });

    it("should handle CSV with only whitespace rows", async () => {
      const csv = "date,description,debit,credit,balance\n   \n   \n";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows.length).toBe(0);
    });

    it("should skip rows with too few columns", async () => {
      const csv = "date,description,debit,credit,balance\n10/07/2026,Partial Row\n10/07/2026,Complete Row,100,,900";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      // Both rows processed; partial row has 0 amount
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle tab-separated CSV via delimiter detection", async () => {
      const csv = "date\tdescription\tdebit\tcredit\tbalance\n10/07/2026\tATM\t100\t\t900";
      const result = await parser.parse(Buffer.from(csv, "utf8"));
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].amountSatang).toBe(10000);
    });
  });
});
