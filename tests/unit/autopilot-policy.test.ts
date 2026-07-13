import { describe, it, expect } from "vitest";
import { decideAutopilotAction, type AutopilotPolicyInput } from "@/lib/autopilot/autopilot-policy";
import type { AutopilotValidationResult } from "@/lib/autopilot/autopilot-validator";

function validValidation(overrides: Partial<AutopilotValidationResult> = {}): AutopilotValidationResult {
  return {
    ok: true,
    evidence: [],
    duplicateCandidates: [],
    hasExactDuplicate: false,
    hasAmbiguousDuplicate: false,
    ...overrides,
  };
}

function basePolicyInput(overrides: Partial<AutopilotPolicyInput> = {}): AutopilotPolicyInput {
  return {
    coreConfidence: "high",
    categoryConfidence: "high",
    validation: validValidation(),
    isReversible: true,
    overridesManualData: false,
    ...overrides,
  };
}

describe("autopilot decision policy", () => {
  it("auto_execute: high core confidence + high category confidence + clean validation", () => {
    const result = decideAutopilotAction(basePolicyInput());
    expect(result.decision).toBe("auto_execute");
    expect(result.risk).toBe("low");
  });

  it("execute_with_notice: high core confidence + medium category confidence", () => {
    const result = decideAutopilotAction(basePolicyInput({ categoryConfidence: "medium" }));
    expect(result.decision).toBe("execute_with_notice");
  });

  it("execute_with_notice: medium core confidence + high category confidence", () => {
    const result = decideAutopilotAction(basePolicyInput({ coreConfidence: "medium" }));
    expect(result.decision).toBe("execute_with_notice");
  });

  it("require_confirmation: possible internal transfer evidence present", () => {
    const result = decideAutopilotAction(
      basePolicyInput({
        validation: validValidation({ evidence: [{ reasonCode: "possible_internal_transfer" }] }),
      }),
    );
    expect(result.decision).toBe("require_confirmation");
  });

  it("require_confirmation: ambiguous duplicate candidate", () => {
    const result = decideAutopilotAction(
      basePolicyInput({
        validation: validValidation({
          hasAmbiguousDuplicate: true,
          evidence: [{ reasonCode: "possible_duplicate" }],
          duplicateCandidates: [{ transactionId: "tx-1", score: 40, reasons: ["ยอดเงินเท่ากัน"] }],
        }),
      }),
    );
    expect(result.decision).toBe("require_confirmation");
  });

  it("require_confirmation: low core confidence even with clean validation", () => {
    const result = decideAutopilotAction(basePolicyInput({ coreConfidence: "low" }));
    expect(result.decision).toBe("require_confirmation");
  });

  it("require_confirmation: irreversible action never auto-executes", () => {
    const result = decideAutopilotAction(basePolicyInput({ isReversible: false }));
    expect(result.decision).toBe("require_confirmation");
  });

  it("reject: schema/business validation failed", () => {
    const result = decideAutopilotAction(basePolicyInput({ validation: validValidation({ ok: false }) }));
    expect(result.decision).toBe("reject");
  });

  it("reject: action would override protected manual data", () => {
    const result = decideAutopilotAction(basePolicyInput({ overridesManualData: true }));
    expect(result.decision).toBe("reject");
    expect(result.risk).toBe("irreversible");
  });

  it("reject: exact duplicate is rejected outright, not deferred to confirmation", () => {
    const result = decideAutopilotAction(
      basePolicyInput({
        validation: validValidation({
          hasExactDuplicate: true,
          evidence: [{ reasonCode: "duplicate_of_existing_transaction" }],
        }),
      }),
    );
    expect(result.decision).toBe("reject");
  });

  it("require_confirmation: medium core + medium category confidence (too much combined uncertainty)", () => {
    const result = decideAutopilotAction(basePolicyInput({ coreConfidence: "medium", categoryConfidence: "medium" }));
    expect(result.decision).toBe("require_confirmation");
  });
});
