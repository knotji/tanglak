import { describe, expect, it } from "vitest";
import { decideReconciliationPolicy, type ReconciliationPolicyInput } from "@/lib/reconciliation/reconciliation-policy";

function baseInput(overrides: Partial<ReconciliationPolicyInput> = {}): ReconciliationPolicyInput {
  return {
    userId: "user-1",
    candidateType: "own_account_transfer",
    sourceTransactionIds: ["tx-a", "tx-b"],
    confidence: "high",
    evidence: [],
    ...overrides,
  };
}

describe("decideReconciliationPolicy", () => {
  it("auto_match_safe: high confidence with strong corroboration (reference match) on a transfer/duplicate", () => {
    const result = decideReconciliationPolicy(
      baseInput({ evidence: [{ reasonCode: "reference_match" }] }),
    );
    expect(result.outcome).toBe("auto_match_safe");
  });

  it("suggest_with_notice: high confidence but no strong corroboration", () => {
    const result = decideReconciliationPolicy(baseInput({ evidence: [{ reasonCode: "opposite_direction" }] }));
    expect(result.outcome).toBe("suggest_with_notice");
  });

  it("suggest_with_notice: medium confidence", () => {
    const result = decideReconciliationPolicy(baseInput({ confidence: "medium" }));
    expect(result.outcome).toBe("suggest_with_notice");
  });

  it("require_confirmation: incomplete evidence (unknown confidence) defaults safely", () => {
    const result = decideReconciliationPolicy(baseInput({ confidence: "unknown" }));
    expect(result.outcome).toBe("require_confirmation");
    expect(result.evidence.map((e) => e.reasonCode)).toContain("insufficient_evidence");
  });

  it("require_confirmation: low confidence never escalates", () => {
    const result = decideReconciliationPolicy(baseInput({ confidence: "low", evidence: [{ reasonCode: "reference_match" }] }));
    expect(result.outcome).toBe("require_confirmation");
  });

  it("require_confirmation: conflicting/ambiguous evidence always wins over a high score", () => {
    const result = decideReconciliationPolicy(
      baseInput({ evidence: [{ reasonCode: "reference_match" }, { reasonCode: "multiple_possible_matches" }] }),
    );
    expect(result.outcome).toBe("require_confirmation");
  });

  it("require_confirmation: likely_debt_payment never exceeds require_confirmation even with strong evidence", () => {
    const result = decideReconciliationPolicy(
      baseInput({ candidateType: "likely_debt_payment", evidence: [{ reasonCode: "explicit_debt_destination" }] }),
    );
    expect(result.outcome).toBe("require_confirmation");
  });

  it("require_confirmation: possible_refund is never auto-confirmed", () => {
    const result = decideReconciliationPolicy(
      baseInput({ candidateType: "possible_refund", evidence: [{ reasonCode: "reference_match" }] }),
    );
    expect(result.outcome).toBe("require_confirmation");
  });

  it("reject_candidate: invalid candidate with a self-match (duplicate source ids)", () => {
    const result = decideReconciliationPolicy(baseInput({ sourceTransactionIds: ["tx-a", "tx-a"] }));
    expect(result.outcome).toBe("reject_candidate");
    expect(result.evidence.map((e) => e.reasonCode)).toContain("self_match_rejected");
  });

  it("reject_candidate: invalid candidate with empty source ids", () => {
    const result = decideReconciliationPolicy(baseInput({ sourceTransactionIds: [] }));
    expect(result.outcome).toBe("reject_candidate");
  });

  it("reject_candidate: cross-user source transaction defensively rejected", () => {
    const result = decideReconciliationPolicy(
      baseInput({ userId: "user-1", sourceTransactionUserIds: ["user-1", "user-2"] }),
    );
    expect(result.outcome).toBe("reject_candidate");
    expect(result.evidence.map((e) => e.reasonCode)).toContain("cross_user_rejected");
  });

  it("never returns auto_match_safe for anything other than high confidence + strong corroboration", () => {
    const outcomes = (["high", "medium", "low", "unknown"] as const).map(
      (confidence) => decideReconciliationPolicy(baseInput({ confidence, evidence: [] })).outcome,
    );
    expect(outcomes).not.toContain("auto_match_safe");
  });
});
