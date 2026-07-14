import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockState } from "@/lib/data/mock-store";
import {
  createReconciliationCandidate,
  findActiveReconciliationCandidateByIdempotencyKey,
} from "@/lib/reconciliation/reconciliation-candidates-repository";
import { hasSnapshotDrifted, invalidateStaleReconciliationCandidates } from "@/lib/reconciliation/reconciliation-invalidation";
import type { ReconciliationCandidateDraft } from "@/lib/reconciliation/reconciliation-types";
import type { ReconciliationCandidateStatus } from "@/lib/reconciliation/reconciliation-types";
import type { Transaction } from "@/types/domain";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const USER_ID = "invalidation-test-user";

function baseTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-a",
    userId: USER_ID,
    type: "expense",
    status: "confirmed",
    amountSatang: 100_000,
    currency: "THB",
    occurredAt: "2026-07-10T10:00:00+07:00",
    merchant: "Grab",
    source: "manual",
    ...overrides,
  };
}

function draft(overrides: Partial<ReconciliationCandidateDraft> = {}): ReconciliationCandidateDraft {
  return {
    userId: USER_ID,
    candidateType: "possible_duplicate",
    sourceTransactionIds: ["tx-a", "tx-b"],
    evidence: [{ reasonCode: "amount_exact_match" }],
    confidence: "low",
    evidenceSnapshots: [
      { type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00", merchant: "Grab" },
      { type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:01:00+07:00", merchant: "Grab" },
    ],
    ...overrides,
  };
}

describe("hasSnapshotDrifted", () => {
  it("is false when nothing reconciliation-relevant changed", () => {
    const snapshot = { type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00", merchant: "Grab" };
    expect(hasSnapshotDrifted(baseTransaction({ note: "unrelated note change" }), snapshot)).toBe(false);
  });

  it("is true when the amount changed", () => {
    const snapshot = { type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00", merchant: "Grab" };
    expect(hasSnapshotDrifted(baseTransaction({ amountSatang: 200_000 }), snapshot)).toBe(true);
  });

  it("is true when a manual category correction was applied", () => {
    const snapshot = { type: "expense", amountSatang: 100_000, occurredAt: "2026-07-10T10:00:00+07:00", merchant: "Grab", category: "transport" };
    expect(hasSnapshotDrifted(baseTransaction({ category: "food" }), snapshot)).toBe(true);
  });
});

describe("invalidateStaleReconciliationCandidates", () => {
  beforeEach(() => {
    getMockState().reconciliationCandidates = [];
  });

  it("invalidates a candidate whose source transaction was deleted", async () => {
    const { record } = await createReconciliationCandidate({ draft: draft(), policyOutcome: "require_confirmation", requiresReview: true });

    const invalidated = await invalidateStaleReconciliationCandidates(USER_ID, "tx-a", undefined);

    expect(invalidated).toHaveLength(1);
    expect(invalidated[0].id).toBe(record.id);
    expect(invalidated[0].status).toBe("invalidated");
    expect(invalidated[0].invalidationReason).toBe("transaction_deleted");
  });

  it("invalidates a candidate whose source transaction was edited", async () => {
    await createReconciliationCandidate({ draft: draft(), policyOutcome: "require_confirmation", requiresReview: true });

    const edited = baseTransaction({ id: "tx-a", amountSatang: 999_999 });
    const invalidated = await invalidateStaleReconciliationCandidates(USER_ID, "tx-a", edited);

    expect(invalidated).toHaveLength(1);
    expect(invalidated[0].invalidationReason).toBe("transaction_modified");
  });

  it("leaves a candidate untouched when the transaction did not change", async () => {
    await createReconciliationCandidate({ draft: draft(), policyOutcome: "require_confirmation", requiresReview: true });

    const unchanged = baseTransaction({ id: "tx-a" });
    const invalidated = await invalidateStaleReconciliationCandidates(USER_ID, "tx-a", unchanged);

    expect(invalidated).toHaveLength(0);
    expect(getMockState().reconciliationCandidates[0].status).not.toBe("invalidated");
  });

  it("never overwrites the transaction itself -- only the candidate row changes", async () => {
    await createReconciliationCandidate({ draft: draft(), policyOutcome: "require_confirmation", requiresReview: true });
    const edited = baseTransaction({ id: "tx-a", amountSatang: 999_999 });
    const editedSnapshotBefore = { ...edited };

    await invalidateStaleReconciliationCandidates(USER_ID, "tx-a", edited);

    expect(edited).toEqual(editedSnapshotBefore);
  });

  it("invalidates proposed candidates when source evidence changes", async () => {
    const { record } = await createReconciliationCandidate({
      draft: draft(),
      policyOutcome: "auto_match_safe",
      requiresReview: false,
    });

    const invalidated = await invalidateStaleReconciliationCandidates(USER_ID, "tx-a", undefined);

    expect(record.status).toBe("proposed");
    expect(invalidated).toHaveLength(1);
    expect(invalidated[0].id).toBe(record.id);
    expect(invalidated[0].status).toBe("invalidated");
  });

  it("invalidates needs_review candidates when source evidence changes", async () => {
    const { record } = await createReconciliationCandidate({
      draft: draft(),
      policyOutcome: "require_confirmation",
      requiresReview: true,
    });

    const invalidated = await invalidateStaleReconciliationCandidates(USER_ID, "tx-a", undefined);

    expect(record.status).toBe("needs_review");
    expect(invalidated).toHaveLength(1);
    expect(invalidated[0].id).toBe(record.id);
    expect(invalidated[0].status).toBe("invalidated");
  });

  it.each<ReconciliationCandidateStatus>(["confirmed", "rejected", "invalidated"])(
    "preserves %s candidates when source evidence changes",
    async (status) => {
      const { record } = await createReconciliationCandidate({
        draft: draft(),
        policyOutcome: "require_confirmation",
        requiresReview: true,
      });
      getMockState().reconciliationCandidates[0] = {
        ...getMockState().reconciliationCandidates[0],
        status,
        invalidatedAt: status === "invalidated" ? "2026-07-10T00:00:00.000Z" : undefined,
        invalidationReason: status === "invalidated" ? "transaction_modified" : undefined,
      };

      const invalidated = await invalidateStaleReconciliationCandidates(USER_ID, "tx-a", undefined);

      expect(invalidated).toHaveLength(0);
      expect(getMockState().reconciliationCandidates).toHaveLength(1);
      expect(getMockState().reconciliationCandidates[0].id).toBe(record.id);
      expect(getMockState().reconciliationCandidates[0].status).toBe(status);
    },
  );

  it("rescan after invalidation can still create exactly one fresh active candidate", async () => {
    const original = await createReconciliationCandidate({
      draft: draft(),
      policyOutcome: "require_confirmation",
      requiresReview: true,
    });

    await invalidateStaleReconciliationCandidates(USER_ID, "tx-a", undefined);

    const rescanned = await Promise.all([
      createReconciliationCandidate({ draft: draft({ confidence: "high" }), policyOutcome: "suggest_with_notice", requiresReview: true }),
      createReconciliationCandidate({ draft: draft({ confidence: "high" }), policyOutcome: "suggest_with_notice", requiresReview: true }),
    ]);
    const created = rescanned.filter((result) => result.created);
    const active = await findActiveReconciliationCandidateByIdempotencyKey(USER_ID, original.record.idempotencyKey);

    expect(created).toHaveLength(1);
    expect(active?.id).toBe(created[0].record.id);
    expect(getMockState().reconciliationCandidates.filter((row) => row.status !== "invalidated")).toHaveLength(1);
    expect(getMockState().reconciliationCandidates.filter((row) => row.status === "invalidated")).toHaveLength(1);
  });
});
