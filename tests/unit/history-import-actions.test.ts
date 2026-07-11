import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockState } from "@/lib/data/mock-store";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
    requireUser: vi.fn(async () => ({ id: "user-a", email: "user-a@example.test" })),
  };
});

import { requireUser } from "@/lib/auth/session";
import { confirmBatchAction, rollbackBatchAction } from "@/app/actions/history-import";
import { createImportBatch, createImportRows } from "@/lib/data/finance-repository";
import type { ImportRow } from "@/types/domain";

function rowInput(overrides: Partial<ImportRow> = {}): Omit<ImportRow, "id" | "createdAt" | "updatedAt"> {
  return {
    userId: "user-a",
    importBatchId: "batch-placeholder",
    sourceRowIndex: 0,
    occurredAt: "2026-07-10T12:00:00+07:00",
    description: "GrabFood",
    merchant: "GrabFood",
    amountSatang: 18_900,
    direction: "debit",
    currency: "THB",
    duplicateScore: 0,
    reviewStatus: "ready",
    importDecision: "unresolved",
    validationWarnings: [],
    parserSource: "deterministic",
    ...overrides,
  };
}

async function seedBatch(userId: string, rowCount: number) {
  const batch = await createImportBatch(userId, {
    sourceType: "generic_csv",
    storagePath: `${userId}/history-imports/test.csv`,
    mimeType: "text/csv",
    fileSize: 100,
  });
  const rows = await createImportRows(
    userId,
    Array.from({ length: rowCount }, (_, i) => rowInput({ userId, importBatchId: batch.id, sourceRowIndex: i })),
  );
  return { batch, rows };
}

describe("confirmBatchAction / rollbackBatchAction idempotency", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.importBatches = [];
    state.importRows = [];
    state.users.clear();
    vi.mocked(requireUser).mockResolvedValue({ id: "user-a", email: "user-a@example.test" });
  });

  it("double-clicking submit (two sequential identical calls) does not create duplicate transactions", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    const decisions = [{ rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 }];

    const first = await confirmBatchAction(batch.id, undefined, decisions);
    const second = await confirmBatchAction(batch.id, undefined, decisions);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(1);
  });

  it("rapid concurrent submissions for the same batch do not create duplicate transactions", async () => {
    const { batch, rows } = await seedBatch("user-a", 3);
    const decisions = rows.map((r) => ({ rowId: r.id, decision: "import" as const, amountSatang: 18_900 }));

    const results = await Promise.all([
      confirmBatchAction(batch.id, undefined, decisions),
      confirmBatchAction(batch.id, undefined, decisions),
      confirmBatchAction(batch.id, undefined, decisions),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    const state = getMockState();
    for (const row of rows) {
      expect(state.transactions.filter((t) => t.importRowId === row.id)).toHaveLength(1);
    }
  });

  it("reports partial success (not full success) when some rows fail, and a later retry finishes cleanly", async () => {
    const { batch, rows } = await seedBatch("user-a", 2);
    const badDecisions = [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
      {
        rowId: rows[1].id,
        decision: "import" as const,
        transactionType: "debt_payment" as const,
        debtId: "does-not-exist",
        amountSatang: 5_000,
      },
    ];
    const first = await confirmBatchAction(batch.id, undefined, badDecisions);
    expect(first.ok).toBe(true);
    expect(first.message).toContain("บางส่วน");
    expect(first.message).not.toMatch(/error|exception|stack|postgres|zod/i);

    const retryDecisions = [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
      { rowId: rows[1].id, decision: "skip" as const },
    ];
    const retry = await confirmBatchAction(batch.id, undefined, retryDecisions);
    expect(retry.ok).toBe(true);
    expect(retry.message).toBe("นำเข้าข้อมูลสำเร็จ");

    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(1);
  });

  it("another authenticated user cannot commit someone else's batch", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);

    vi.mocked(requireUser).mockResolvedValue({ id: "user-b", email: "user-b@example.test" });
    const result = await confirmBatchAction(batch.id, undefined, [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
    ]);

    expect(result.ok).toBe(false);
    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(0);
  });

  it("another authenticated user cannot roll back someone else's batch", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    await confirmBatchAction(batch.id, undefined, [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
    ]);

    vi.mocked(requireUser).mockResolvedValue({ id: "user-b", email: "user-b@example.test" });
    const result = await rollbackBatchAction(batch.id);

    expect(result.ok).toBe(false);
    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(1); // untouched
  });

  it("safe error messages never leak internal identifiers or stack details", async () => {
    const result = await confirmBatchAction("nonexistent-batch-id", undefined, [
      { rowId: "nonexistent-row-id", decision: "import" as const, amountSatang: 18_900 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).not.toMatch(/at Object\.|at async|\.ts:\d+|postgres|relation "public\./i);
  });
});
