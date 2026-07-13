import { describe, it, expect } from "vitest";
import { parseAutopilotActionProposal } from "@/lib/autopilot/autopilot-action-schema";

function baseCreateTransactionCandidate(overrides: Record<string, unknown> = {}) {
  return {
    type: "create_transaction",
    source: "slip_import",
    payload: {
      transactionType: "expense",
      amountSatang: 12_000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      merchant: "Seven-Eleven",
      categoryId: "food",
      ...overrides,
    },
  };
}

describe("autopilot action schema", () => {
  it("accepts a well-formed create_transaction proposal", () => {
    const result = parseAutopilotActionProposal(baseCreateTransactionCandidate());
    expect(result.ok).toBe(true);
  });

  it("rejects a non-positive amount for an expense", () => {
    const result = parseAutopilotActionProposal(baseCreateTransactionCandidate({ amountSatang: 0 }));
    expect(result.ok).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = parseAutopilotActionProposal(baseCreateTransactionCandidate({ amountSatang: -500 }));
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid/unrecognized canonical category id", () => {
    const result = parseAutopilotActionProposal(baseCreateTransactionCandidate({ categoryId: "not-a-real-category" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed occurredAt (not a Bangkok-offset instant)", () => {
    const result = parseAutopilotActionProposal(baseCreateTransactionCandidate({ occurredAt: "2026-07-10" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a transfer transaction proposed under a non-transfer category", () => {
    const result = parseAutopilotActionProposal(
      baseCreateTransactionCandidate({ transactionType: "transfer", categoryId: "food" }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a zero-amount transfer under the transfers category", () => {
    const result = parseAutopilotActionProposal(
      baseCreateTransactionCandidate({ transactionType: "transfer", categoryId: "transfers", amountSatang: 0 }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a debt_payment with no debtId", () => {
    const result = parseAutopilotActionProposal(
      baseCreateTransactionCandidate({ transactionType: "debt_payment", categoryId: "debt" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an action type that is not allowlisted", () => {
    const result = parseAutopilotActionProposal({
      type: "delete_transaction",
      source: "slip_import",
      payload: {},
    });
    expect(result.ok).toBe(false);
  });

  it("rejects malformed source metadata (unknown field, strict mode)", () => {
    const result = parseAutopilotActionProposal({
      ...baseCreateTransactionCandidate(),
      sourceMetadata: { documentId: "doc-1", unexpectedField: "should not be here" },
    });
    expect(result.ok).toBe(false);
  });
});
