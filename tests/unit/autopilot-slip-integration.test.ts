import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSlipImportAutopilot } from "@/lib/autopilot/autopilot-slip-integration";
import { getMockState } from "@/lib/data/mock-store";
import type { ExtractedFinancialDocument } from "@/lib/ai/schemas";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

function extraction(overrides: Partial<ExtractedFinancialDocument> = {}): ExtractedFinancialDocument {
  return {
    documentType: "delivery_receipt",
    confidence: 0.88,
    transaction: {
      type: "expense",
      amount: 185,
      currency: "THB",
      occurredAt: "2026-07-10T12:30:00+07:00",
      merchant: "GrabFood",
    },
    warnings: [],
    unclearFields: [],
    requiresReview: true,
    ...overrides,
  } as ExtractedFinancialDocument;
}

describe("Slip Import autopilot vertical slice", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.autopilotActions = [];
  });

  it("auto-creates a transaction end-to-end for a high-confidence delivery receipt", async () => {
    const outcome = await runSlipImportAutopilot("user-a", "doc-1", extraction());

    expect(outcome.kind).toBe("executed");
    if (outcome.kind === "executed") {
      expect(outcome.transaction.amountSatang).toBe(18_500);
      expect(outcome.transaction.type).toBe("expense");
    }
    expect(getMockState().transactions).toHaveLength(1);
    expect(getMockState().autopilotActions).toHaveLength(1);
  });

  it("defers to manual review when core fields are marked unclear, even if confidence is numerically high", async () => {
    const outcome = await runSlipImportAutopilot(
      "user-a",
      "doc-2",
      extraction({ unclearFields: ["transaction.amount"] }),
    );

    expect(outcome.kind).toBe("deferred");
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("defers when Gemini flags a possible internal transfer", async () => {
    const outcome = await runSlipImportAutopilot(
      "user-a",
      "doc-3",
      extraction({
        transaction: {
          type: "expense",
          amount: 500,
          currency: "THB",
          occurredAt: "2026-07-10T12:30:00+07:00",
          merchant: "โอนเงินตัวเอง",
          possibleOwnAccountTransfer: true,
        },
      }),
    );

    expect(outcome.kind).toBe("deferred");
    if (outcome.kind === "deferred") expect(outcome.reason).toBe("require_confirmation");
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("is not applicable for document types outside the Phase 1 slip-import slice (e.g. salary_slip)", async () => {
    const outcome = await runSlipImportAutopilot(
      "user-a",
      "doc-4",
      extraction({
        documentType: "salary_slip",
        transaction: { type: "income", amount: 38920, currency: "THB", occurredAt: "2026-07-25T10:00:00+07:00" },
      }),
    );

    expect(outcome.kind).toBe("not_applicable");
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("does not create a duplicate transaction for an exact repeat (idempotent replay)", async () => {
    const first = await runSlipImportAutopilot("user-a", "doc-5", extraction());
    expect(first.kind).toBe("executed");

    await runSlipImportAutopilot("user-a", "doc-5", extraction());
    // Same documentId/amount/occurredAt -> same idempotency key -> the
    // executor returns the prior result rather than writing a second row.
    expect(getMockState().transactions).toHaveLength(1);
  });

  it("applies the learned category and sets learned_rule provenance based on user history", async () => {
    // 1. Setup mock history for user-a: 3 manual matches for "Special Café" -> "ช้อปปิ้ง"
    // We add a trailing space to the merchant name to bypass identical case-insensitive matching
    // in duplicate detection while still resolving correctly under normalizeMerchant.
    const state = getMockState();
    state.transactions = [
      {
        id: "tx-h1",
        userId: "user-a",
        type: "expense",
        status: "confirmed",
        amountSatang: 1200,
        currency: "THB",
        occurredAt: "2026-07-01T12:00:00+07:00",
        merchant: "Special Café ",
        category: "ช้อปปิ้ง",
        source: "manual",
        categorySource: "manual",
      },
      {
        id: "tx-h2",
        userId: "user-a",
        type: "expense",
        status: "confirmed",
        amountSatang: 1500,
        currency: "THB",
        occurredAt: "2026-07-02T12:00:00+07:00",
        merchant: "Special Café ",
        category: "ช้อปปิ้ง",
        source: "manual",
        categorySource: "manual",
      },
      {
        id: "tx-h3",
        userId: "user-a",
        type: "expense",
        status: "confirmed",
        amountSatang: 1800,
        currency: "THB",
        occurredAt: "2026-07-03T12:00:00+07:00",
        merchant: "Special Café ",
        category: "ช้อปปิ้ง",
        source: "manual",
        categorySource: "manual",
      },
    ];

    // 2. Run autopilot for "Special Café"
    const doc = extraction({
      transaction: {
        type: "expense",
        amount: 200,
        currency: "THB",
        occurredAt: "2026-07-10T12:30:00+07:00",
        merchant: "Special Café",
      },
    });

    const outcome = await runSlipImportAutopilot("user-a", "doc-learning", doc);

    expect(outcome.kind).toBe("executed");
    if (outcome.kind === "executed") {
      expect(outcome.transaction.category).toBe("ช้อปปิ้ง");
      const savedTx = getMockState().transactions.find((tx) => tx.id === outcome.transaction.id);
      expect(savedTx?.categorySource).toBe("learned_rule");
      expect(savedTx?.categoryConfidence).toBe(0.9); // High confidence tier maps to 0.9
    }
  });

  it("does not leak learned category history from other users", async () => {
    // 1. Setup mock history: user-b has history, user-a does not
    const state = getMockState();
    state.transactions = [
      {
        id: "tx-hb1",
        userId: "user-b",
        type: "expense",
        status: "confirmed",
        amountSatang: 1200,
        currency: "THB",
        occurredAt: "2026-07-01T12:00:00+07:00",
        merchant: "Special Café ",
        category: "ช้อปปิ้ง",
        source: "manual",
        categorySource: "manual",
      },
      {
        id: "tx-hb2",
        userId: "user-b",
        type: "expense",
        status: "confirmed",
        amountSatang: 1500,
        currency: "THB",
        occurredAt: "2026-07-02T12:00:00+07:00",
        merchant: "Special Café ",
        category: "ช้อปปิ้ง",
        source: "manual",
        categorySource: "manual",
      },
      {
        id: "tx-hb3",
        userId: "user-b",
        type: "expense",
        status: "confirmed",
        amountSatang: 1800,
        currency: "THB",
        occurredAt: "2026-07-03T12:00:00+07:00",
        merchant: "Special Café ",
        category: "ช้อปปิ้ง",
        source: "manual",
        categorySource: "manual",
      },
    ];

    const doc = extraction({
      transaction: {
        type: "expense",
        amount: 200,
        currency: "THB",
        occurredAt: "2026-07-10T12:30:00+07:00",
        merchant: "Special Café",
      },
    });

    const outcome = await runSlipImportAutopilot("user-a", "doc-learning-isolated", doc);

    expect(outcome.kind).toBe("executed");
    if (outcome.kind === "executed") {
      // Should fallback to default "อาหารและเครื่องดื่ม" because there is no history for user-a
      expect(outcome.transaction.category).toBe("อาหารและเครื่องดื่ม");
      const savedTx = getMockState().transactions.find((tx) => tx.id === outcome.transaction.id);
      expect(savedTx?.categorySource).toBe("ai");
    }
  });
});
