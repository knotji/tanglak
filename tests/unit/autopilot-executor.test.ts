import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAutopilotAction } from "@/lib/autopilot/autopilot-executor";
import { parseAutopilotActionProposal } from "@/lib/autopilot/autopilot-action-schema";
import { getMockState } from "@/lib/data/mock-store";
import { setTransactionCategoryProvenance } from "@/lib/autopilot/autopilot-provenance";
import { createTransaction } from "@/lib/data/finance-repository";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

function proposal(overrides: Record<string, unknown> = {}) {
  const result = parseAutopilotActionProposal({
    type: "create_transaction",
    source: "slip_import",
    sourceMetadata: { documentId: "doc-1" },
    payload: {
      transactionType: "expense",
      amountSatang: 18_500,
      occurredAt: "2026-07-10T12:30:00+07:00",
      merchant: "GrabFood",
      categoryId: "food",
      ...overrides,
    },
  });
  if (!result.ok) throw new Error("test setup: proposal did not parse: " + result.errors.join(", "));
  return result.proposal;
}

describe("autopilot executor", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.autopilotActions = [];
  });

  it("auto-executes a high-confidence, high-category-confidence proposal and writes an audit record", async () => {
    const result = await executeAutopilotAction({
      userId: "user-a",
      proposal: proposal(),
      coreConfidence: "high",
      categoryConfidence: "high",
      candidateTransactions: [],
    });

    expect(result.ok).toBe(true);
    expect(result.decision).toBe("auto_execute");
    expect(result.transaction).toBeDefined();

    const state = getMockState();
    expect(state.transactions).toHaveLength(1);
    const auditRecord = state.autopilotActions.find((a) => a.id === result.auditRecordId);
    expect(auditRecord?.status).toBe("executed");
    expect(auditRecord?.entityId).toBe(result.transaction!.id);
  });

  it("defers (does not create a transaction) when confidence is low", async () => {
    const result = await executeAutopilotAction({
      userId: "user-a",
      proposal: proposal(),
      coreConfidence: "low",
      categoryConfidence: "high",
      candidateTransactions: [],
    });

    expect(result.decision).toBe("require_confirmation");
    expect(getMockState().transactions).toHaveLength(0);
  });

  it("is idempotent: replaying the same proposal does not create a second transaction", async () => {
    const p = proposal();
    const first = await executeAutopilotAction({
      userId: "user-a",
      proposal: p,
      coreConfidence: "high",
      categoryConfidence: "high",
      candidateTransactions: [],
    });
    const second = await executeAutopilotAction({
      userId: "user-a",
      proposal: p,
      coreConfidence: "high",
      categoryConfidence: "high",
      candidateTransactions: [],
    });

    expect(first.auditRecordId).toBe(second.auditRecordId);
    expect(getMockState().transactions).toHaveLength(1);
  });

  it("never overwrites a manually-protected category (rejects rather than executing)", async () => {
    const existing = await createTransaction("user-a", {
      type: "expense",
      amountSatang: 18_500,
      occurredAt: "2026-07-10T12:30:00+07:00",
      merchant: "GrabFood",
      category: "อาหารและเครื่องดื่ม",
    });
    await setTransactionCategoryProvenance("user-a", existing.id, "manual", undefined);

    // This scenario is exercised at the provenance layer (autopilot-executor
    // only ever creates NEW transactions in Phase 1, so it cannot itself
    // overwrite manual data) -- confirm the protection holds directly.
    const protection = await setTransactionCategoryProvenance("user-a", existing.id, "ai", 0.9);
    expect(protection.applied).toBe(false);
    expect(protection.reason).toBe("protected_manual_category");
  });

  it("records a failed execution in the audit log and rethrows rather than swallowing the error", async () => {
    // Force a downstream failure by pointing at a debt id that doesn't
    // exist -- createTransaction's own ownership guard throws.
    const failing = parseAutopilotActionProposal({
      type: "create_transaction",
      source: "slip_import",
      payload: {
        transactionType: "debt_payment",
        amountSatang: 5_000,
        occurredAt: "2026-07-10T12:00:00+07:00",
        categoryId: "debt",
        debtId: "nonexistent-debt-id",
      },
    });
    if (!failing.ok) throw new Error("test setup failed");

    await expect(
      executeAutopilotAction({
        userId: "user-a",
        proposal: failing.proposal,
        coreConfidence: "high",
        categoryConfidence: "high",
        candidateTransactions: [],
      }),
    ).rejects.toThrow();

    const state = getMockState();
    const failedRecord = state.autopilotActions.find((a) => a.status === "failed");
    expect(failedRecord).toBeDefined();
  });

  it("fails closed with an explicit rejected audit record for an action type with no executor implementation yet", async () => {
    const parsed = parseAutopilotActionProposal({
      type: "update_transaction_category",
      source: "system_rule",
      payload: { transactionId: "tx-1", categoryId: "food" },
    });
    if (!parsed.ok) throw new Error("test setup failed");

    await expect(
      executeAutopilotAction({
        userId: "user-a",
        proposal: parsed.proposal,
        coreConfidence: "high",
        categoryConfidence: "high",
        candidateTransactions: [],
      }),
    ).rejects.toThrow();

    // Fails closed (throws, no transaction/category change happens) AND
    // still leaves an explicit rejected audit record -- a thrown error
    // alone would satisfy "cannot silently execute" but not "every
    // outcome is audited".
    const state = getMockState();
    const rejectedRecord = state.autopilotActions.find(
      (a) => a.actionType === "update_transaction_category" && a.status === "rejected",
    );
    expect(rejectedRecord).toBeDefined();
    expect(rejectedRecord?.decision).toBe("reject");
  });

  it("never stores anything base64/image-shaped in the audit proposal payload", async () => {
    await executeAutopilotAction({
      userId: "user-a",
      proposal: proposal(),
      coreConfidence: "high",
      categoryConfidence: "high",
      candidateTransactions: [],
    });

    const state = getMockState();
    const serialized = JSON.stringify(state.autopilotActions);
    expect(serialized).not.toMatch(/data:image\//);
    expect(serialized.length).toBeLessThan(5000); // no large embedded blob of any kind
  });
});
