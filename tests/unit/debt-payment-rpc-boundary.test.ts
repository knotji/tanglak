import { describe, expect, it, vi } from "vitest";
import { addDebtPayment } from "@/lib/data/finance-repository";
import { DEBT_ERROR_NOT_ACTIVE_TH, DEBT_ERROR_NOT_FOUND_TH } from "@/lib/finance/debt-guards";

/**
 * Exercises the non-mock-auth code path of `addDebtPayment`: the whole
 * payment write is now a single `record_debt_payment` RPC call (see
 * supabase/migrations/202607140003_atomic_debt_payment_rpc.sql), replacing
 * the previous three independent Supabase round-trips (insert transaction,
 * insert debt_payments, recalculate). A real Postgres instance isn't
 * available in this test environment, so these tests verify the
 * application-layer contract instead: exactly one write call reaches the
 * database, and a failure from that single call never triggers any further
 * write call -- there is no code path left in the TypeScript layer that
 * could itself leave a half-written payment. The actual rollback-on-error
 * guarantee is provided by Postgres's function transaction semantics,
 * documented in the migration and exercised at the database level (see the
 * PR description's manual verification checklist).
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

function makeQueryBuilder(result: FakeResult) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

function makeFakeSupabase(options: {
  rpcResult: FakeResult;
  transactionRow?: Record<string, unknown>;
  debtRow?: Record<string, unknown>;
}) {
  const fromSpy = vi.fn((table: string) => {
    if (table === "transactions") {
      return makeQueryBuilder({ data: options.transactionRow ?? null, error: null });
    }
    if (table === "debts") {
      return makeQueryBuilder({ data: options.debtRow ?? null, error: null });
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
  it("performs the write as exactly one record_debt_payment RPC call", async () => {
    const fake = makeFakeSupabase({
      rpcResult: { data: [{ transaction_id: "tx-1", already_recorded: false }], error: null },
      transactionRow: fakeTransactionRow(),
      debtRow: fakeDebtRow(),
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
    expect(transaction.id).toBe("tx-1");
    expect(debt.id).toBe(DEBT_ID);
  });

  it("throws a safe Thai message and performs no further reads when the RPC rejects an inactive debt", async () => {
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

  it("never leaks a raw/unknown Postgres error message to the caller", async () => {
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
