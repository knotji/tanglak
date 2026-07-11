import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createImportBatch,
  createImportRows,
  createDebt,
  importReviewedRows,
  listImportRows,
  getImportBatch,
  rollbackImportBatch,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import type { ImportRow } from "@/types/domain";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
  };
});

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

async function seedBatch(userId: string, rowCount: number, amountSatang = 18_900) {
  const batch = await createImportBatch(userId, {
    sourceType: "generic_csv",
    storagePath: `${userId}/history-imports/test.csv`,
    mimeType: "text/csv",
    fileSize: 100,
  });
  const rows = await createImportRows(
    userId,
    Array.from({ length: rowCount }, (_, i) =>
      rowInput({ userId, importBatchId: batch.id, sourceRowIndex: i, amountSatang }),
    ),
  );
  return { batch, rows };
}

describe("history import commit idempotency", () => {
  beforeEach(() => {
    const state = getMockState();
    state.transactions = [];
    state.debts = [];
    state.accounts = [];
    state.importBatches = [];
    state.importRows = [];
    state.users.clear();
  });

  it("does not create a duplicate transaction when the identical commit request is sent twice", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    const decisions = [{ rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 }];

    const first = await importReviewedRows("user-a", batch.id, undefined, decisions);
    const second = await importReviewedRows("user-a", batch.id, undefined, decisions);

    expect(first.importedCount).toBe(1);
    expect(second.importedCount).toBe(1); // reported as imported again, but...
    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(1); // ...only one actually exists
  });

  it("does not create duplicates under concurrent commit requests for the same row", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    const decisions = [{ rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 }];

    await Promise.all([
      importReviewedRows("user-a", batch.id, undefined, decisions),
      importReviewedRows("user-a", batch.id, undefined, decisions),
      importReviewedRows("user-a", batch.id, undefined, decisions),
    ]);

    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(1);
  });

  it("refresh-and-resubmit (a fresh call with the same decisions) does not recreate a committed transaction", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    const decisions = [{ rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 }];

    await importReviewedRows("user-a", batch.id, undefined, decisions);
    const [afterFirst] = await listImportRows("user-a", batch.id);
    const firstTxId = afterFirst.createdTransactionId;

    await importReviewedRows("user-a", batch.id, undefined, decisions);
    const [afterSecond] = await listImportRows("user-a", batch.id);

    expect(afterSecond.createdTransactionId).toBe(firstTxId);
    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(1);
  });

  it("a row committed as a debt_payment is not recreated on retry, and the debt's paid-this-cycle total is not double-counted", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
    const { batch, rows } = await seedBatch("user-a", 1, 20_000);
    const decisions = [
      { rowId: rows[0].id, decision: "import" as const, transactionType: "debt_payment" as const, debtId: debt.id, amountSatang: 20_000 },
    ];

    await importReviewedRows("user-a", batch.id, undefined, decisions);
    await importReviewedRows("user-a", batch.id, undefined, decisions);

    const state = getMockState();
    const updatedDebt = state.debts.find((d) => d.id === debt.id);
    expect(updatedDebt?.amountPaidThisCycleSatang).toBe(20_000); // not 40,000
    expect(state.transactions.filter((t) => t.debtId === debt.id)).toHaveLength(1);
  });

  it("a failed row does not abort the rest of the batch, is retryable, and does not mark the batch as fully completed", async () => {
    const { batch, rows } = await seedBatch("user-a", 2);
    const decisions = [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
      // Row 2 references a debt that doesn't exist -> this row fails.
      {
        rowId: rows[1].id,
        decision: "import" as const,
        transactionType: "debt_payment" as const,
        debtId: "does-not-exist",
        amountSatang: 5_000,
      },
    ];

    const result = await importReviewedRows("user-a", batch.id, undefined, decisions);

    expect(result.importedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.rowId).toBe(rows[1].id);

    const batchAfter = await getImportBatch("user-a", batch.id);
    expect(batchAfter?.status).toBe("partially_imported"); // never falsely "completed"

    const rowsAfter = await listImportRows("user-a", batch.id);
    expect(rowsAfter.find((r) => r.id === rows[0].id)?.reviewStatus).toBe("imported");
    expect(rowsAfter.find((r) => r.id === rows[1].id)?.reviewStatus).not.toBe("imported"); // left retryable
  });

  it("retrying after a partial failure completes only the remaining row, without recreating the already-committed one", async () => {
    const debt = await createDebt("user-a", {
      name: "KTC",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-18",
    });
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
    const firstAttempt = await importReviewedRows("user-a", batch.id, undefined, badDecisions);
    expect(firstAttempt.failedCount).toBe(1);

    // Retry with corrected data for the failed row only (as a real client
    // would after being told which row failed); row 1's decision is
    // resubmitted unchanged, simulating a full-batch retry/resubmit.
    const retryDecisions = [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
      {
        rowId: rows[1].id,
        decision: "import" as const,
        transactionType: "debt_payment" as const,
        debtId: debt.id,
        amountSatang: 5_000,
      },
    ];
    const retryResult = await importReviewedRows("user-a", batch.id, undefined, retryDecisions);
    expect(retryResult.failedCount).toBe(0);
    expect(retryResult.remainingCount).toBe(0);

    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(1);
    expect(state.transactions.filter((t) => t.importRowId === rows[1].id)).toHaveLength(1);

    const batchAfter = await getImportBatch("user-a", batch.id);
    expect(batchAfter?.status).toBe("completed");
  });

  it("excluded (skipped) rows remain excluded even if a retry sends a different decision for them", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    await importReviewedRows("user-a", batch.id, undefined, [{ rowId: rows[0].id, decision: "skip" as const }]);

    // A later retry mistakenly (or maliciously) tries to import the
    // already-skipped row -- it must stay skipped.
    await importReviewedRows("user-a", batch.id, undefined, [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
    ]);

    const rowsAfter = await listImportRows("user-a", batch.id);
    expect(rowsAfter[0]?.reviewStatus).toBe("skipped");
    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(0);
  });

  it("duplicate rows marked skipped stay skipped on retry (no transaction ever created for them)", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    await createImportRows("user-a", []); // no-op, keeps parity with other tests
    await importReviewedRows("user-a", batch.id, undefined, [
      { rowId: rows[0].id, decision: "skip" as const, duplicateTransactionId: undefined },
    ]);
    await importReviewedRows("user-a", batch.id, undefined, [
      { rowId: rows[0].id, decision: "skip" as const },
    ]);

    const rowsAfter = await listImportRows("user-a", batch.id);
    expect(rowsAfter[0]?.reviewStatus).toBe("skipped");
  });

  it("legitimate same-amount transactions from separate batches are both created, not deduplicated against each other", async () => {
    const { batch: batchA, rows: rowsA } = await seedBatch("user-a", 1, 50_000);
    const { batch: batchB, rows: rowsB } = await seedBatch("user-a", 1, 50_000);

    await importReviewedRows("user-a", batchA.id, undefined, [
      { rowId: rowsA[0].id, decision: "import" as const, amountSatang: 50_000 },
    ]);
    await importReviewedRows("user-a", batchB.id, undefined, [
      { rowId: rowsB[0].id, decision: "import" as const, amountSatang: 50_000 },
    ]);

    const state = getMockState();
    expect(state.transactions.filter((t) => t.amountSatang === 50_000 && t.userId === "user-a")).toHaveLength(2);
  });

  it("another user cannot commit rows belonging to someone else's batch", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);

    await expect(
      importReviewedRows("user-b", batch.id, undefined, [
        { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
      ]),
    ).rejects.toThrow();

    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(0);
    // user-a's row remains untouched/unresolved.
    const rowsAfter = await listImportRows("user-a", batch.id);
    expect(rowsAfter[0]?.reviewStatus).toBe("ready");
  });

  it("rollback stays ownership-scoped: another user cannot roll back someone else's batch", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    await importReviewedRows("user-a", batch.id, undefined, [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
    ]);

    await expect(rollbackImportBatch("user-b", batch.id)).rejects.toThrow();

    const state = getMockState();
    expect(state.transactions.filter((t) => t.importRowId === rows[0].id)).toHaveLength(1); // untouched
    const batchAfter = await getImportBatch("user-a", batch.id);
    expect(batchAfter?.status).not.toBe("rolled_back");
  });

  it("rollback is idempotent on repeated calls (already-rolled-back is a safe no-op)", async () => {
    const { batch, rows } = await seedBatch("user-a", 1);
    await importReviewedRows("user-a", batch.id, undefined, [
      { rowId: rows[0].id, decision: "import" as const, amountSatang: 18_900 },
    ]);

    await rollbackImportBatch("user-a", batch.id);
    await expect(rollbackImportBatch("user-a", batch.id)).resolves.not.toThrow();

    const batchAfter = await getImportBatch("user-a", batch.id);
    expect(batchAfter?.status).toBe("rolled_back");
  });
});
