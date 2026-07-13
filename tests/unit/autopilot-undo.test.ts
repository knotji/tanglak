import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAutopilotAction } from "@/lib/autopilot/autopilot-executor";
import { parseAutopilotActionProposal } from "@/lib/autopilot/autopilot-action-schema";
import { undoAutopilotAction } from "@/lib/autopilot/autopilot-undo";
import { getMockState } from "@/lib/data/mock-store";
import { updateTransaction } from "@/lib/data/finance-repository";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

async function createAutoExecutedAction(userId = "user-a") {
  const parsed = parseAutopilotActionProposal({
    type: "create_transaction",
    source: "slip_import",
    sourceMetadata: { documentId: "doc-1" },
    payload: {
      transactionType: "expense",
      amountSatang: 18_500,
      occurredAt: "2026-07-10T12:30:00+07:00",
      merchant: "GrabFood",
      categoryId: "food",
    },
  });
  if (!parsed.ok) throw new Error("test setup failed");
  const result = await executeAutopilotAction({
    userId,
    proposal: parsed.proposal,
    coreConfidence: "high",
    categoryConfidence: "high",
    candidateTransactions: [],
  });
  if (!result.ok || !result.transaction) throw new Error("test setup: execution did not succeed");
  return result;
}

describe("autopilot undo", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.autopilotActions = [];
  });

  it("undoes an auto-created transaction, deleting it and marking the audit record undone", async () => {
    const executed = await createAutoExecutedAction();
    const result = await undoAutopilotAction("user-a", executed.auditRecordId);

    expect(result.ok).toBe(true);
    expect(getMockState().transactions).toHaveLength(0);
    if (result.ok) {
      expect(result.auditRecord.status).toBe("undone");
      expect(result.auditRecord.undoneAt).toBeDefined();
    }
  });

  it("refuses to undo the same action twice", async () => {
    const executed = await createAutoExecutedAction();
    await undoAutopilotAction("user-a", executed.auditRecordId);
    const second = await undoAutopilotAction("user-a", executed.auditRecordId);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_undone");
  });

  it("refuses to undo a transaction the user edited after auto-creation", async () => {
    const executed = await createAutoExecutedAction();
    await updateTransaction("user-a", executed.transaction!.id, { merchant: "Edited By User" });

    const result = await undoAutopilotAction("user-a", executed.auditRecordId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("transaction_modified");
    // The transaction must still exist -- undo refused, not silently applied.
    expect(getMockState().transactions).toHaveLength(1);
  });

  it("refuses to undo another user's action", async () => {
    // getAutopilotActionRecord itself already scopes the lookup to the
    // requesting user's own rows, so a cross-user attempt reports
    // "not_found" rather than leaking that a record exists for someone
    // else -- either way, undo never proceeds for a non-owner.
    const executed = await createAutoExecutedAction("user-a");
    const result = await undoAutopilotAction("user-b", executed.auditRecordId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(["not_found", "not_owner"]).toContain(result.reason);
  });

  it("reports not_found for a nonexistent audit record id", async () => {
    const result = await undoAutopilotAction("user-a", "does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });
});
