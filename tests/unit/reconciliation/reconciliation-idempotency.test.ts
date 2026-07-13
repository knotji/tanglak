import { describe, expect, it } from "vitest";
import {
  canonicalizeSourceTransactionIds,
  computeReconciliationIdempotencyKey,
} from "@/lib/reconciliation/reconciliation-idempotency";

describe("canonicalizeSourceTransactionIds", () => {
  it("sorts ids deterministically regardless of input order", () => {
    expect(canonicalizeSourceTransactionIds(["b", "a"])).toEqual(["a", "b"]);
    expect(canonicalizeSourceTransactionIds(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("computeReconciliationIdempotencyKey", () => {
  it("produces the same key regardless of source-id order (reversed pair)", () => {
    const forward = computeReconciliationIdempotencyKey({
      userId: "user-1",
      candidateType: "own_account_transfer",
      sourceTransactionIds: ["tx-a", "tx-b"],
    });
    const reversed = computeReconciliationIdempotencyKey({
      userId: "user-1",
      candidateType: "own_account_transfer",
      sourceTransactionIds: ["tx-b", "tx-a"],
    });
    expect(reversed).toBe(forward);
  });

  it("is stable across repeated calls with identical input", () => {
    const input = {
      userId: "user-1",
      candidateType: "possible_duplicate" as const,
      sourceTransactionIds: ["tx-a", "tx-b"],
    };
    expect(computeReconciliationIdempotencyKey(input)).toBe(computeReconciliationIdempotencyKey(input));
  });

  it("differs by user, so two users' otherwise-identical candidates never collide", () => {
    const userA = computeReconciliationIdempotencyKey({
      userId: "user-a",
      candidateType: "own_account_transfer",
      sourceTransactionIds: ["tx-a", "tx-b"],
    });
    const userB = computeReconciliationIdempotencyKey({
      userId: "user-b",
      candidateType: "own_account_transfer",
      sourceTransactionIds: ["tx-a", "tx-b"],
    });
    expect(userA).not.toBe(userB);
  });

  it("differs by candidate type for the same source ids", () => {
    const transfer = computeReconciliationIdempotencyKey({
      userId: "user-1",
      candidateType: "own_account_transfer",
      sourceTransactionIds: ["tx-a", "tx-b"],
    });
    const duplicate = computeReconciliationIdempotencyKey({
      userId: "user-1",
      candidateType: "possible_duplicate",
      sourceTransactionIds: ["tx-a", "tx-b"],
    });
    expect(transfer).not.toBe(duplicate);
  });

  it("incorporates relatedDebtIds (for likely_debt_payment) independent of order", () => {
    const forward = computeReconciliationIdempotencyKey({
      userId: "user-1",
      candidateType: "likely_debt_payment",
      sourceTransactionIds: ["tx-a"],
      relatedDebtIds: ["debt-1", "debt-2"],
    });
    const reversed = computeReconciliationIdempotencyKey({
      userId: "user-1",
      candidateType: "likely_debt_payment",
      sourceTransactionIds: ["tx-a"],
      relatedDebtIds: ["debt-2", "debt-1"],
    });
    expect(reversed).toBe(forward);
  });
});
