import { describe, expect, it, vi } from "vitest";
import { addDebtPayment } from "@/lib/data/finance-repository";
import { DEBT_ERROR_NOT_ACTIVE_TH, DEBT_ERROR_NOT_FOUND_TH } from "@/lib/finance/debt-guards";

/**
 * Exercises the non-mock-auth code path of `addDebtPayment`: the whole
 * payment write is a single `record_debt_payment` RPC call (see
 * supabase/migrations/202607140004_fix_debt_payment_race_and_status.sql),
 * which returns the fully committed transaction and debt rows directly. A
 * real Postgres instance isn't available in this test environment, so
 * these tests verify the application-layer contract instead: exactly one
 * write call reaches the database, the returned committed rows are mapped
 * directly with no separate post-commit read for the primary payment
 * (eliminating the "payment committed but a later read failed, so it was
 * reported as failed" class of bug), and a failure from the RPC call is
 * always mapped to safe Thai copy. The RPC's own rollback and idempotency
 * race-safety guarantees are provided by Postgres itself (locking the debt
 * row before checking for a replay), documented in the migration.
 */

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => false };
});

const createSupabaseServerClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock(),
}));

type FakeResult = { data: unknown; error: { message: string } | null };

/**
 * A single query-builder chain can be awaited in two different shapes by
 * this codebase: terminated explicitly with `.maybeSingle()`/`.single()`
 * (a single row), or awaited directly with no terminal call (a plain
 * array, e.g. recalculateDebtPaidThisCycle's `.select("amount_satang")`
 * sum query). `singleResult` serves the former; `arrayResult` (via the
 * builder's own `.then`) serves the latter.
 */
function makeQueryBuilder(singleResult: FakeResult, arrayResult: FakeResult = { data: [], error: null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "update", "insert", "eq", "neq", "gte", "lt", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(singleResult);
  builder.single = () => Promise.resolve(singleResult);
  builder.then = (onResolve: (value: FakeResult) => unknown, onReject?: (reason: unknown) => unknown) =>
    Promise.resolve(arrayResult).then(onResolve, onReject);
  return builder;
}

function makeFakeSupabase(options: {
  rpcResult: FakeResult;
  updatedTransactionRow?: Record<string, unknown>;
  debtRowForRecalculation?: Record<string, unknown>;
}) {
  const fromSpy = vi.fn((table: string) => {
    if (table === "transactions") {
      // Covers both updateTransaction's own single-row reads/writes and
      // recalculateDebtPaidThisCycle's plain array sum query (reusing the
      // same amount so the recalculated total stays a known value).
      const row = options.updatedTransactionRow ?? fakeTransactionRow();
      return makeQueryBuilder(
        { data: row, error: null },
        { data: [{ amount_satang: row.amount_satang }], error: null },
      );
    }
    if (table === "debts") {
      // Reached via updateTransaction's ownership re-check and
      // recalculateDebtPaidThisCycle's own debt lookup/update when a note
      // is applied post-commit -- not part of the primary payment write.
      const row = options.debtRowForRecalculation ?? fakeDebtRow();
      return makeQueryBuilder({ data: row, error: null });
    }
    throw new Error(`unexpected table in test: ${table}`);
  });
  const rpcSpy = vi.fn(() => Promise.resolve(options.rpcResult));
  return { from: fromSpy, rpc: rpcSpy };
}

const USER_ID = "rpc-boundary-user";
const DEBT_ID = "11111111-1111-1111-1111-111111111111";

function fakeTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    user_id: USER_ID,
    type: "debt_payment",
    status: "confirmed",
    amount_satang: 50000,
    currency: "THB",
    occurred_at: "2026-07-10T12:00:00+07:00",
    merchant: "ชำระ Card",
    category_label: null,
    category_source: null,
    category_confidence: null,
    source_account_id: null,
    destination_account_id: null,
    debt_id: DEBT_ID,
    document_id: null,
    reference_number: null,
    payment_method: null,
    account_last_four: null,
    destination_account_last_four: null,
    bank: null,
    source: "manual",
    confidence: null,
    note: null,
    import_batch_id: null,
    import_row_id: null,
    is_historical: false,
    updated_at: null,
    ...overrides,
  };
}

function fakeDebtRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DEBT_ID,
    user_id: USER_ID,
    name: "Card",
    creditor: null,
    debt_type: "credit_card",
    payment_mode: "variable_monthly",
    original_amount_satang: null,
    outstanding_balance_satang: 500000,
    statement_balance_satang: null,
    amount_due_satang: 500000,
    minimum_payment_satang: 100000,
    amount_paid_this_cycle_satang: 50000,
    due_date: "2026-07-25",
    recurring_due_day: null,
    statement_date: null,
    cycle_start_date: null,
    cycle_end_date: null,
    interest_rate_annual: null,
    remaining_installments: null,
    credit_limit_satang: null,
    status: "active",
    notes: null,
    ...overrides,
  };
}

describe("addDebtPayment (non-mock path): single atomic RPC call", () => {
  it("performs the write as exactly one record_debt_payment RPC call and maps the committed rows directly (no post-commit read)", async () => {
    const fake = makeFakeSupabase({
      rpcResult: {
        data: [
          {
            transaction_id: "tx-1",
            already_recorded: false,
            transaction_row: fakeTransactionRow(),
            debt_row: fakeDebtRow(),
          },
        ],
        error: null,
      },
    });
    createSupabaseServerClientMock.mockResolvedValue(fake);

    const { transaction, debt } = await addDebtPayment(USER_ID, DEBT_ID, 500_00, "2026-07-10T12:00:00+07:00", {
      idempotencyKey: "doc-key-1",
    });

    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("record_debt_payment", {
      p_user_id: USER_ID,
      p_debt_id: DEBT_ID,
      p_amount_satang: 500_00,
      p_occurred_at: "2026-07-10T12:00:00+07:00",
      p_idempotency_key: "doc-key-1",
    });
    // No follow-up SELECT for the primary payment write -- the committed
    // rows came straight back from the RPC call itself.
    expect(fake.from).not.toHaveBeenCalled();
    expect(transaction.id).toBe("tx-1");
    expect(transaction.debtId).toBe(DEBT_ID);
    expect(debt.id).toBe(DEBT_ID);
    expect(debt.amountPaidThisCycleSatang).toBe(50000);
  });

  it("still applies an explicit note as a separate write after a fresh payment, without discarding the committed row", async () => {
    const fake = makeFakeSupabase({
      rpcResult: {
        data: [
          {
            transaction_id: "tx-1",
            already_recorded: false,
            transaction_row: fakeTransactionRow(),
            debt_row: fakeDebtRow(),
          },
        ],
        error: null,
      },
      updatedTransactionRow: fakeTransactionRow({ note: "จ่ายผ่านแอปธนาคาร" }),
    });
    createSupabaseServerClientMock.mockResolvedValue(fake);

    const { transaction } = await addDebtPayment(USER_ID, DEBT_ID, 500_00, "2026-07-10T12:00:00+07:00", {
      note: "จ่ายผ่านแอปธนาคาร",
    });

    expect(fake.from).toHaveBeenCalledWith("transactions");
    expect(transaction.note).toBe("จ่ายผ่านแอปธนาคาร");
  });

  it("does not re-apply a note on an idempotent replay (already_recorded)", async () => {
    const fake = makeFakeSupabase({
      rpcResult: {
        data: [
          {
            transaction_id: "tx-1",
            already_recorded: true,
            transaction_row: fakeTransactionRow(),
            debt_row: fakeDebtRow(),
          },
        ],
        error: null,
      },
    });
    createSupabaseServerClientMock.mockResolvedValue(fake);

    await addDebtPayment(USER_ID, DEBT_ID, 500_00, "2026-07-10T12:00:00+07:00", {
      idempotencyKey: "doc-key-1",
      note: "จ่ายผ่านแอปธนาคาร",
    });

    expect(fake.from).not.toHaveBeenCalled();
  });

  it("throws a safe Thai message and performs no further calls when the RPC rejects an inactive debt", async () => {
    const fake = makeFakeSupabase({
      rpcResult: { data: null, error: { message: "debt is not active" } },
    });
    createSupabaseServerClientMock.mockResolvedValue(fake);

    await expect(addDebtPayment(USER_ID, DEBT_ID, 500_00, "2026-07-10T12:00:00+07:00")).rejects.toThrow(
      DEBT_ERROR_NOT_ACTIVE_TH,
    );
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("maps a not-found RPC error to the safe Thai not-found message", async () => {
    const fake = makeFakeSupabase({
      rpcResult: { data: null, error: { message: "debt not found or not owned by user" } },
    });
    createSupabaseServerClientMock.mockResolvedValue(fake);

    await expect(addDebtPayment(USER_ID, DEBT_ID, 500_00, "2026-07-10T12:00:00+07:00")).rejects.toThrow(
      DEBT_ERROR_NOT_FOUND_TH,
    );
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("never leaks a raw/unknown Postgres error message to the caller (e.g. a residual unique-constraint race)", async () => {
    const fake = makeFakeSupabase({
      rpcResult: { data: null, error: { message: 'duplicate key value violates unique constraint "debt_payments_pkey"' } },
    });
    createSupabaseServerClientMock.mockResolvedValue(fake);

    let caught: unknown;
    try {
      await addDebtPayment(USER_ID, DEBT_ID, 500_00, "2026-07-10T12:00:00+07:00");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toMatch(/duplicate key value|constraint/);
  });
});
