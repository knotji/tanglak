import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "@/app/actions/documents";
import { extractedFinancialDocumentSchema } from "@/lib/ai/schemas";
import {
  classifySchemaValidationError,
  DOCUMENT_EXTRACTION_PERMANENT_MESSAGE,
} from "@/lib/ai/extraction-errors";
import { scoreDuplicateCandidate } from "@/lib/finance/duplicates";
import { salaryNetIncomeSatang, deliveryTotalPaidSatang } from "@/lib/finance/calculations";
import { bahtToSatang } from "@/lib/finance/money";
import type { Transaction } from "@/types/domain";

describe("File validation & sanitization", () => {
  it("sanitizes filename and preserves supported extension", async () => {
    const safe = await sanitizeFilename("my slip  with spaces!!.png");
    expect(safe).toContain("my_slip_with_spaces_");
    expect(safe.endsWith(".png")).toBe(true);
  });

  it("throws error for unsupported extensions", async () => {
    await expect(sanitizeFilename("virus.exe")).rejects.toThrow("นามสกุลไฟล์ไม่รองรับ");
    await expect(sanitizeFilename("document.docx")).rejects.toThrow("นามสกุลไฟล์ไม่รองรับ");
  });
});

describe("Gemini Schema Parsing & Validation", () => {
  it("parses valid bank transfer slip schema with the new transfer fields", () => {
    const data = {
      documentType: "transfer_slip",
      confidence: 0.95,
      transaction: {
        type: "transfer",
        amount: 1500.5,
        currency: "THB",
        occurredAt: "2026-07-10T12:00:00+07:00",
        merchant: "SCB Receiver",
        referenceNumber: "123456789",
        accountLastFour: "5678",
        destinationAccountLastFour: "1234",
        bank: "SCB",
        possibleDebtPayment: false,
        possibleOwnAccountTransfer: true,
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    };

    const parsed = extractedFinancialDocumentSchema.parse(data);
    expect(parsed.documentType).toBe("transfer_slip");
    expect(parsed.transaction?.destinationAccountLastFour).toBe("1234");
    expect(parsed.transaction?.bank).toBe("SCB");
    expect(parsed.transaction?.possibleOwnAccountTransfer).toBe(true);
  });

  it("defaults missing Gemini metadata without changing financial fields", () => {
    const parsed = extractedFinancialDocumentSchema.parse({
      documentType: "receipt",
      transaction: {
        type: "expense",
        amount: 189,
        currency: "THB",
        occurredAt: "2026-07-10T12:00:00+07:00",
      },
    });

    expect(parsed.confidence).toBe(0);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.unclearFields).toEqual([]);
    expect(parsed.requiresReview).toBe(true);
    expect(parsed.transaction?.amount).toBe(189);
  });

  it("rejects malformed metadata when Gemini sends it", () => {
    expect(() =>
      extractedFinancialDocumentSchema.parse({
        documentType: "receipt",
        confidence: "0.8",
        transaction: {
          type: "expense",
          amount: 189,
          occurredAt: "2026-07-10T12:00:00+07:00",
        },
      }),
    ).toThrow();

    expect(() =>
      extractedFinancialDocumentSchema.parse({
        documentType: "receipt",
        warnings: "none",
        transaction: {
          type: "expense",
          amount: 189,
          occurredAt: "2026-07-10T12:00:00+07:00",
        },
      }),
    ).toThrow();
  });

  it("fails missing required financial fields instead of inventing values", () => {
    const result = extractedFinancialDocumentSchema.safeParse({
      documentType: "receipt",
      transaction: {
        type: "expense",
        occurredAt: "2026-07-10T12:00:00+07:00",
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const classified = classifySchemaValidationError(result.error);
      expect(classified.code).toBe("incomplete_financial_extraction");
      expect(classified.missingFields).toEqual(["transaction.amount"]);
      expect(classified.message).toBe(DOCUMENT_EXTRACTION_PERMANENT_MESSAGE);
    }
  });

  it("rejects a negative transaction.amount from Gemini rather than accepting it as extracted", () => {
    const result = extractedFinancialDocumentSchema.safeParse({
      documentType: "receipt",
      transaction: {
        type: "expense",
        amount: -189,
        currency: "THB",
        occurredAt: "2026-07-10T12:00:00+07:00",
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });

    expect(result.success).toBe(false);
    // Never auto-corrected: no code path turns this into a passing parse
    // with amount coerced to 189 or 0.
    if (!result.success) {
      const classified = classifySchemaValidationError(result.error);
      // Safe Thai UI message only — no raw Zod issue text leaks through.
      expect(classified.message).toBe(DOCUMENT_EXTRACTION_PERMANENT_MESSAGE);
      expect(classified.message).not.toMatch(/zod|nonnegative|greater than or equal/i);
    }
  });

  it("rejects negative debt statement fields (amountDue, minimumPayment, outstandingBalance) from Gemini", () => {
    const result = extractedFinancialDocumentSchema.safeParse({
      documentType: "debt_statement",
      debt: {
        outstandingBalance: -1000,
        amountDue: 500,
        minimumPayment: 200,
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });
    expect(result.success).toBe(false);

    const negativeAmountDue = extractedFinancialDocumentSchema.safeParse({
      documentType: "debt_statement",
      debt: {
        outstandingBalance: 1000,
        amountDue: -500,
        minimumPayment: 200,
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });
    expect(negativeAmountDue.success).toBe(false);

    const negativeMinimumPayment = extractedFinancialDocumentSchema.safeParse({
      documentType: "debt_statement",
      debt: {
        outstandingBalance: 1000,
        amountDue: 500,
        minimumPayment: -200,
      },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });
    expect(negativeMinimumPayment.success).toBe(false);
  });

  it("accepts a zero receipt total but rejects a negative one", () => {
    const zero = extractedFinancialDocumentSchema.safeParse({
      documentType: "receipt",
      transaction: { type: "expense", amount: 0, currency: "THB", occurredAt: "2026-07-10T12:00:00+07:00" },
      receipt: { totalPaid: 0 },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });
    expect(zero.success).toBe(true);

    const negative = extractedFinancialDocumentSchema.safeParse({
      documentType: "receipt",
      transaction: { type: "expense", amount: 189, currency: "THB", occurredAt: "2026-07-10T12:00:00+07:00" },
      receipt: { totalPaid: -189 },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });
    expect(negative.success).toBe(false);
  });
});

describe("Duplicate Candidate Scoring with new fields", () => {
  const baseTx: Transaction = {
    id: "tx-existing",
    userId: "user-1",
    type: "transfer",
    status: "confirmed",
    amountSatang: 150050,
    currency: "THB",
    occurredAt: "2026-07-10T12:00:00+07:00",
    source: "transfer_slip",
    accountLastFour: "5678",
  };

  it("adds score for accountLastFour match", () => {
    const incoming: Transaction = {
      id: "tx-incoming",
      userId: "user-1",
      type: "transfer",
      status: "draft",
      amountSatang: 150050, // same amount (+25)
      currency: "THB",
      occurredAt: "2026-07-10T12:05:00+07:00", // time close (+25)
      source: "transfer_slip", // same source (+10)
      accountLastFour: "5678", // same account last four (+15)
    };

    const res = scoreDuplicateCandidate(incoming, baseTx);
    expect(res.reasons).toContain("เลขบัญชีสี่ตัวท้ายตรงกัน");
    expect(res.score).toBeGreaterThan(50);
  });
});

describe("Financial maths", () => {
  it("converts baht to satang correctly", () => {
    expect(bahtToSatang("1500.50")).toBe(150050);
    expect(bahtToSatang("0.25")).toBe(25);
  });

  it("calculates net income salary correctly", () => {
    expect(salaryNetIncomeSatang({ netIncomeSatang: 3892000, grossIncomeSatang: 4500000 })).toBe(3892000);
    expect(salaryNetIncomeSatang({ grossIncomeSatang: 4500000 })).toBe(4500000);
  });

  it("calculates delivery total paid correctly", () => {
    expect(
      deliveryTotalPaidSatang({
        subtotalSatang: 22000,
        deliveryFeeSatang: 2500,
        discountSatang: 6000,
      })
    ).toBe(18500);
  });
});
