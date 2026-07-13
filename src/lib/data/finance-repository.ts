import { isMockAuthEnabled } from "@/lib/auth/session";
import { getMockState } from "@/lib/data/mock-store";
import { mapDebt, mapTransaction, mapDocument, mapDocumentExtraction, mapImportBatch, mapImportRow, mapMonthlyBudget, mapBudgetCategory } from "@/lib/data/mappers";
import { timeAsync } from "@/lib/observability/timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertMoneySatang } from "@/lib/finance/money-guards";
import { BUDGET_ERROR_DUPLICATE_TH, BUDGET_ERROR_NOT_FOUND_TH } from "@/lib/finance/budget-guards";
import {
  assertInterestRateAnnual,
  assertMinimumNotAboveOutstanding,
  assertDebtPaymentLinked,
} from "@/lib/finance/debt-guards";
import { getBangkokMonthOf, getDebtCycleWindow, isValidDateKey, isValidMonthQuery } from "@/lib/finance/date";
import { logSafeError } from "@/lib/observability/safe-diagnostics";
import type { Debt, Transaction, FinanceDocument, DocumentExtraction, ImportBatch, ImportRow, Account, MonthlyBudget, BudgetCategory } from "@/types/domain";

export const DOCUMENT_PROCESSING_LEASE_MS = 2 * 60 * 1000;

export type TransactionInput = {
  type: Transaction["type"];
  amountSatang: number;
  occurredAt: string;
  merchant?: string;
  category?: string;
  debtId?: string;
  note?: string;
  paymentMethod?: string;
  accountLastFour?: string;
  destinationAccountLastFour?: string;
  bank?: string;
  source?: Transaction["source"];
  documentId?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  importBatchId?: string;
  importRowId?: string;
  isHistorical?: boolean;
};

export type DebtInput = {
  name: string;
  creditor?: string;
  debtType?: Debt["debtType"];
  outstandingBalanceSatang?: number;
  statementBalanceSatang?: number;
  amountDueSatang: number;
  minimumPaymentSatang: number;
  dueDate: string;
  recurringDueDay?: number;
  statementDate?: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  paymentMode?: Debt["paymentMode"];
  interestRateAnnual?: number;
  remainingInstallments?: number;
  creditLimitSatang?: number;
  notes?: string;
};

function assertOwner(userId: string, ownerId: string) {
  if (userId !== ownerId) throw new Error("Cannot access another user's data");
}

/**
 * A transaction's `debtId` is a client/caller-supplied foreign key — never
 * trust it without confirming the referenced debt actually belongs to the
 * same user. Without this, one user could point their own transaction's
 * debt_id at another user's debt row (the debts table itself stays
 * protected by its own RLS/user_id scoping, but the transaction would carry
 * a cross-user reference and skew that debt's recalculated totals).
 */
async function assertDebtBelongsToUser(userId: string, debtId: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const debt = getMockState().debts.find((item) => item.id === debtId);
    if (!debt || debt.userId !== userId) throw new Error("Debt not found");
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("debts")
    .select("id")
    .eq("id", debtId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Debt not found");
}

async function assertAccountBelongsToUser(userId: string, accountId: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const account = getMockState().accounts.find((item) => item.id === accountId);
    if (!account || account.userId !== userId) throw new Error("Account not found");
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Account not found");
}

function assertOptionalInteger(value: number | undefined, fieldName: string): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
}

function assertOptionalDateKey(value: string | undefined, fieldName: string): void {
  if (value === undefined) return;
  if (!isValidDateKey(value)) throw new Error(`${fieldName} is invalid`);
}

function validateDebtInput(input: Partial<DebtInput>, existing?: Debt): void {
  assertMoneySatang(input.outstandingBalanceSatang, "nonnegative", "outstandingBalanceSatang");
  assertMoneySatang(input.statementBalanceSatang, "nonnegative", "statementBalanceSatang");
  assertMoneySatang(input.amountDueSatang, "nonnegative", "amountDueSatang");
  assertMoneySatang(input.minimumPaymentSatang, "nonnegative", "minimumPaymentSatang");
  assertMoneySatang(input.creditLimitSatang, "nonnegative", "creditLimitSatang");
  assertInterestRateAnnual(input.interestRateAnnual);
  assertOptionalInteger(input.remainingInstallments, "remainingInstallments");
  assertOptionalDateKey(input.dueDate, "dueDate");
  assertOptionalDateKey(input.statementDate, "statementDate");
  assertOptionalDateKey(input.cycleStartDate, "cycleStartDate");
  assertOptionalDateKey(input.cycleEndDate, "cycleEndDate");

  const cycleStartDate = input.cycleStartDate ?? existing?.cycleStartDate;
  const cycleEndDate = input.cycleEndDate ?? existing?.cycleEndDate;
  if (cycleStartDate && cycleEndDate && cycleStartDate > cycleEndDate) {
    throw new Error("Debt cycle start date must be before end date");
  }

  assertInterestRateAnnual(input.interestRateAnnual ?? existing?.interestRateAnnual);
  assertOptionalInteger(input.remainingInstallments ?? existing?.remainingInstallments, "remainingInstallments");

  // Locked Phase 1 rule: minimum payment must never exceed outstanding
  // balance. Checked against the final merged state (patch + existing row
  // together) so a patch that only changes one of the two fields is still
  // validated against the other's current value -- e.g. lowering
  // outstandingBalanceSatang below an already-saved minimumPaymentSatang is
  // rejected even though this patch never touches minimumPaymentSatang.
  const mergedMinimumPaymentSatang = input.minimumPaymentSatang ?? existing?.minimumPaymentSatang;
  const mergedOutstandingBalanceSatang = input.outstandingBalanceSatang ?? existing?.outstandingBalanceSatang;
  assertMinimumNotAboveOutstanding(mergedMinimumPaymentSatang, mergedOutstandingBalanceSatang);
}

const TRANSACTION_COLUMNS =
  "id, user_id, type, status, amount_satang, currency, occurred_at, merchant, category_label, category_source, category_confidence, source_account_id, destination_account_id, debt_id, document_id, reference_number, payment_method, account_last_four, destination_account_last_four, bank, source, confidence, note, import_batch_id, import_row_id, is_historical, updated_at";

const DEBT_COLUMNS =
  "id, user_id, name, creditor, debt_type, payment_mode, original_amount_satang, outstanding_balance_satang, statement_balance_satang, amount_due_satang, minimum_payment_satang, amount_paid_this_cycle_satang, due_date, recurring_due_day, statement_date, cycle_start_date, cycle_end_date, interest_rate_annual, remaining_installments, credit_limit_satang, status, notes";

const IMPORT_BATCH_COLUMNS =
  "id, user_id, source_type, source_name, account_id, original_filename, storage_path, mime_type, file_size, period_start, period_end, statement_date, status, total_rows, parsed_rows, ready_rows, duplicate_rows, review_rows, skipped_rows, imported_rows, failed_rows, parser_name, parser_version, model_name, statement_metadata, detected_layout, page_count, created_at, updated_at, completed_at, rolled_back_at";

const IMPORT_BATCH_LIST_COLUMNS =
  "id, user_id, source_type, source_name, account_id, original_filename, storage_path, mime_type, file_size, period_start, period_end, statement_date, status, total_rows, parsed_rows, ready_rows, duplicate_rows, review_rows, skipped_rows, imported_rows, failed_rows, parser_name, parser_version, model_name, page_count, created_at, updated_at, completed_at, rolled_back_at";

export async function listTransactions(userId: string, month: string): Promise<Transaction[]> {
  if (isMockAuthEnabled()) {
    return getMockState().transactions
      .filter((transaction) => transaction.userId === userId && getBangkokMonthOf(transaction.occurredAt) === month)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  const { data, error } = await timeAsync("query.transactions.month", async () => {
    const supabase = await createSupabaseServerClient();
    return supabase
      .from("transactions")
      .select(TRANSACTION_COLUMNS)
      .eq("user_id", userId)
      .gte("occurred_at", `${month}-01T00:00:00+07:00`)
      .lt("occurred_at", nextMonthStart(month))
      .order("occurred_at", { ascending: false });
  }, { userId });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransaction);
}

export async function listAllTransactions(userId: string): Promise<Transaction[]> {
  if (isMockAuthEnabled()) {
    return getMockState().transactions
      .filter((transaction) => transaction.userId === userId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  const { data, error } = await timeAsync("query.transactions.all", async () => {
    const supabase = await createSupabaseServerClient();
    return supabase
      .from("transactions")
      .select(TRANSACTION_COLUMNS)
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false });
  }, { userId });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransaction);
}

/** Single-transaction fetch by id, scoped to the owning user. Used by the autopilot undo path to re-check current state before reversing an auto-created transaction. */
export async function getTransactionById(userId: string, id: string): Promise<Transaction | null> {
  if (isMockAuthEnabled()) {
    const transaction = getMockState().transactions.find((item) => item.id === id && item.userId === userId);
    return transaction ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTransaction(data) : null;
}

export async function createTransaction(userId: string, input: TransactionInput): Promise<Transaction> {
  assertMoneySatang(input.amountSatang, input.type === "debt_payment" ? "positive" : "nonnegative", "amountSatang");
  assertDebtPaymentLinked(input.type, input.debtId);
  if (input.debtId) await assertDebtBelongsToUser(userId, input.debtId);
  if (input.sourceAccountId) await assertAccountBelongsToUser(userId, input.sourceAccountId);
  if (input.destinationAccountId) await assertAccountBelongsToUser(userId, input.destinationAccountId);

  if (isMockAuthEnabled()) {
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      userId,
      type: input.type,
      status: "confirmed",
      amountSatang: input.amountSatang,
      currency: "THB",
      occurredAt: input.occurredAt,
      merchant: input.merchant,
      category: input.category,
      debtId: input.debtId,
      documentId: input.documentId,
      paymentMethod: input.paymentMethod,
      accountLastFour: input.accountLastFour,
      destinationAccountLastFour: input.destinationAccountLastFour,
      bank: input.bank,
      note: input.note,
      source: input.source || "manual",
      sourceAccountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId,
      importBatchId: input.importBatchId,
      importRowId: input.importRowId,
      isHistorical: input.isHistorical,
    };
    getMockState().transactions.unshift(transaction);
    if (transaction.debtId) recalculateMockDebtPaid(userId, transaction.debtId);
    return transaction;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: input.type,
      status: "confirmed",
      amount_satang: input.amountSatang,
      currency: "THB",
      occurred_at: input.occurredAt,
      merchant: input.merchant,
      category_label: input.category,
      debt_id: input.debtId,
      document_id: input.documentId,
      note: input.note,
      payment_method: input.paymentMethod,
      account_last_four: input.accountLastFour,
      destination_account_last_four: input.destinationAccountLastFour,
      bank: input.bank,
      source: input.source || "manual",
      source_account_id: input.sourceAccountId,
      destination_account_id: input.destinationAccountId,
      import_batch_id: input.importBatchId,
      import_row_id: input.importRowId,
      is_historical: input.isHistorical || false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const transaction = mapTransaction(data);
  if (transaction.debtId) await recalculateDebtPaidThisCycle(userId, transaction.debtId);
  return transaction;
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: Partial<TransactionInput>,
): Promise<Transaction> {
  if (input.debtId) await assertDebtBelongsToUser(userId, input.debtId);
  if (input.sourceAccountId) await assertAccountBelongsToUser(userId, input.sourceAccountId);
  if (input.destinationAccountId) await assertAccountBelongsToUser(userId, input.destinationAccountId);

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.transactions.findIndex((transaction) => transaction.id === id);
    if (index < 0) throw new Error("Transaction not found");
    assertOwner(userId, state.transactions[index].userId);
    // Validate the final merged state (type + amount + debtId together),
    // not just whichever of these happens to be present in this patch.
    const finalType = input.type ?? state.transactions[index].type;
    const finalAmount = input.amountSatang ?? state.transactions[index].amountSatang;
    const finalDebtId = input.debtId !== undefined ? input.debtId : state.transactions[index].debtId;
    assertMoneySatang(finalAmount, finalType === "debt_payment" ? "positive" : "nonnegative", "amountSatang");
    assertDebtPaymentLinked(finalType, finalDebtId);
    const previousDebtId = state.transactions[index].debtId;
    state.transactions[index] = { ...state.transactions[index], ...input };
    if (previousDebtId) recalculateMockDebtPaid(userId, previousDebtId);
    if (state.transactions[index].debtId) recalculateMockDebtPaid(userId, state.transactions[index].debtId);
    return state.transactions[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data: previous } = await supabase
    .from("transactions")
    .select("debt_id, type, amount_satang")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  // Validate the final merged state (type + amount + debtId together), not
  // just whichever of these happens to be present in this patch.
  const finalType = input.type ?? previous?.type;
  const finalAmount = input.amountSatang ?? previous?.amount_satang;
  const finalDebtId = input.debtId !== undefined ? input.debtId : previous?.debt_id;
  assertMoneySatang(finalAmount, finalType === "debt_payment" ? "positive" : "nonnegative", "amountSatang");
  assertDebtPaymentLinked(finalType, finalDebtId);
  const payload: Record<string, unknown> = {};
  if (input.type !== undefined) payload.type = input.type;
  if (input.amountSatang !== undefined) payload.amount_satang = input.amountSatang;
  if (input.occurredAt !== undefined) payload.occurred_at = input.occurredAt;
  if (input.merchant !== undefined) payload.merchant = input.merchant;
  if (input.category !== undefined) payload.category_label = input.category;
  if (input.debtId !== undefined) payload.debt_id = input.debtId;
  if (input.documentId !== undefined) payload.document_id = input.documentId;
  if (input.note !== undefined) payload.note = input.note;
  if (input.paymentMethod !== undefined) payload.payment_method = input.paymentMethod;
  if (input.accountLastFour !== undefined) payload.account_last_four = input.accountLastFour;
  if (input.destinationAccountLastFour !== undefined) payload.destination_account_last_four = input.destinationAccountLastFour;
  if (input.bank !== undefined) payload.bank = input.bank;
  if (input.source !== undefined) payload.source = input.source;
  if (input.sourceAccountId !== undefined) payload.source_account_id = input.sourceAccountId;
  if (input.destinationAccountId !== undefined) payload.destination_account_id = input.destinationAccountId;
  if (input.importBatchId !== undefined) payload.import_batch_id = input.importBatchId;
  if (input.importRowId !== undefined) payload.import_row_id = input.importRowId;
  if (input.isHistorical !== undefined) payload.is_historical = input.isHistorical;
  const { data, error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const transaction = mapTransaction(data);
  if (previous?.debt_id) await recalculateDebtPaidThisCycle(userId, previous.debt_id);
  if (transaction.debtId) await recalculateDebtPaidThisCycle(userId, transaction.debtId);
  return transaction;
}

export async function listDebtPaymentHistory(userId: string, debtId: string): Promise<Transaction[]> {
  if (isMockAuthEnabled()) {
    return getMockState().transactions
      .filter(
        (transaction) =>
          transaction.userId === userId &&
          transaction.debtId === debtId &&
          transaction.type === "debt_payment" &&
          transaction.status === "confirmed",
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("debt_id", debtId)
    .eq("type", "debt_payment")
    .eq("status", "confirmed")
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransaction);
}

export async function deleteTransaction(userId: string, id: string) {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const existing = state.transactions.find((transaction) => transaction.id === id);
    if (!existing) return;
    assertOwner(userId, existing.userId);
    state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
    if (existing.debtId) recalculateMockDebtPaid(userId, existing.debtId);
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("transactions")
    .select("debt_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (existing?.debt_id) await recalculateDebtPaidThisCycle(userId, existing.debt_id);
}

export async function listDebts(userId: string, includeClosed = false): Promise<Debt[]> {
  if (isMockAuthEnabled()) {
    return getMockState().debts.filter((debt) => debt.userId === userId && (includeClosed || debt.status !== "paid_off"));
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("debts").select(DEBT_COLUMNS).eq("user_id", userId).order("due_date", { ascending: true });
  if (!includeClosed) query = query.neq("status", "paid_off");
  const { data, error } = await timeAsync("query.debts", async () => query, { userId });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapDebt);
}

export async function createDebt(userId: string, input: DebtInput): Promise<Debt> {
  // outstandingBalanceSatang defaults to amountDueSatang when not supplied
  // (see the insert below) -- validate against that same effective value so
  // the minimum-not-above-outstanding check can't be bypassed by omitting
  // outstanding balance.
  validateDebtInput({
    ...input,
    outstandingBalanceSatang: input.outstandingBalanceSatang ?? input.amountDueSatang,
  });

  if (isMockAuthEnabled()) {
    const debt: Debt = {
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      creditor: input.creditor,
      debtType: input.debtType ?? "other",
      paymentMode: input.paymentMode ?? "variable_monthly",
      outstandingBalanceSatang: input.outstandingBalanceSatang ?? input.amountDueSatang,
      statementBalanceSatang: input.statementBalanceSatang,
      amountDueSatang: input.amountDueSatang,
      minimumPaymentSatang: input.minimumPaymentSatang,
      amountPaidThisCycleSatang: 0,
      dueDate: input.dueDate,
      recurringDueDay: input.recurringDueDay,
      statementDate: input.statementDate,
      cycleStartDate: input.cycleStartDate,
      cycleEndDate: input.cycleEndDate,
      interestRateAnnual: input.interestRateAnnual,
      remainingInstallments: input.remainingInstallments,
      creditLimitSatang: input.creditLimitSatang,
      status: "active",
      notes: input.notes,
    };
    getMockState().debts.unshift(debt);
    return debt;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("debts")
    .insert({
      user_id: userId,
      name: input.name,
      creditor: input.creditor,
      debt_type: input.debtType ?? "other",
      payment_mode: input.paymentMode ?? "variable_monthly",
      outstanding_balance_satang: input.outstandingBalanceSatang ?? input.amountDueSatang,
      statement_balance_satang: input.statementBalanceSatang,
      amount_due_satang: input.amountDueSatang,
      minimum_payment_satang: input.minimumPaymentSatang,
      amount_paid_this_cycle_satang: 0,
      due_date: input.dueDate,
      recurring_due_day: input.recurringDueDay,
      statement_date: input.statementDate,
      cycle_start_date: input.cycleStartDate,
      cycle_end_date: input.cycleEndDate,
      interest_rate_annual: input.interestRateAnnual,
      remaining_installments: input.remainingInstallments,
      credit_limit_satang: input.creditLimitSatang,
      status: "active",
      notes: input.notes,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDebt(data);
}

export async function updateDebt(userId: string, id: string, input: Partial<DebtInput>): Promise<Debt> {
  // Only fields actually present in this patch are checked here — each of
  // these columns is independently non-negative by design (no cross-field
  // business rule depends on the others), so per-field validation of the
  // patch is equivalent to validating the merged row for these fields.
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.debts.findIndex((debt) => debt.id === id);
    if (index < 0) throw new Error("Debt not found");
    assertOwner(userId, state.debts[index].userId);
    // Validate the final merged state, not just whichever fields happen to
    // be present in this patch -- a patch that omits interestRateAnnual
    // must not be able to leave a previously-invalid value on the row (in
    // practice this can only happen if a row was ever written outside this
    // guard, e.g. directly in SQL; belt-and-braces).
    validateDebtInput(input, state.debts[index]);
    state.debts[index] = {
      ...state.debts[index],
      name: input.name ?? state.debts[index].name,
      creditor: input.creditor ?? state.debts[index].creditor,
      debtType: input.debtType ?? state.debts[index].debtType,
      outstandingBalanceSatang: input.outstandingBalanceSatang ?? state.debts[index].outstandingBalanceSatang,
      statementBalanceSatang: input.statementBalanceSatang ?? state.debts[index].statementBalanceSatang,
      amountDueSatang: input.amountDueSatang ?? state.debts[index].amountDueSatang,
      minimumPaymentSatang: input.minimumPaymentSatang ?? state.debts[index].minimumPaymentSatang,
      dueDate: input.dueDate ?? state.debts[index].dueDate,
      recurringDueDay: input.recurringDueDay ?? state.debts[index].recurringDueDay,
      statementDate: input.statementDate ?? state.debts[index].statementDate,
      cycleStartDate: input.cycleStartDate ?? state.debts[index].cycleStartDate,
      cycleEndDate: input.cycleEndDate ?? state.debts[index].cycleEndDate,
      paymentMode: input.paymentMode ?? state.debts[index].paymentMode,
      interestRateAnnual: input.interestRateAnnual ?? state.debts[index].interestRateAnnual,
      remainingInstallments: input.remainingInstallments ?? state.debts[index].remainingInstallments,
      creditLimitSatang: input.creditLimitSatang ?? state.debts[index].creditLimitSatang,
      notes: input.notes ?? state.debts[index].notes,
    };
    return state.debts[index];
  }

  const supabase = await createSupabaseServerClient();
  const existing = await getDebtForUser(userId, id);
  validateDebtInput(input, existing);
  const { data, error } = await supabase
    .from("debts")
    .update({
      name: input.name,
      creditor: input.creditor,
      debt_type: input.debtType,
      outstanding_balance_satang: input.outstandingBalanceSatang,
      statement_balance_satang: input.statementBalanceSatang,
      amount_due_satang: input.amountDueSatang,
      minimum_payment_satang: input.minimumPaymentSatang,
      due_date: input.dueDate,
      recurring_due_day: input.recurringDueDay,
      statement_date: input.statementDate,
      cycle_start_date: input.cycleStartDate,
      cycle_end_date: input.cycleEndDate,
      payment_mode: input.paymentMode,
      interest_rate_annual: input.interestRateAnnual,
      remaining_installments: input.remainingInstallments,
      credit_limit_satang: input.creditLimitSatang,
      notes: input.notes,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDebt(data);
}

export async function markDebtPaidOff(userId: string, id: string): Promise<Debt> {
  return setDebtStatus(userId, id, "paid_off");
}

export async function reopenDebt(userId: string, id: string): Promise<Debt> {
  return setDebtStatus(userId, id, "active");
}

async function setDebtStatus(userId: string, id: string, status: Debt["status"]): Promise<Debt> {
  if (isMockAuthEnabled()) {
    const debt = getMockState().debts.find((item) => item.id === id);
    if (!debt) throw new Error("Debt not found");
    assertOwner(userId, debt.userId);
    debt.status = status;
    return debt;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("debts")
    .update({
      status,
      paid_off_at: status === "paid_off" ? new Date().toISOString() : undefined,
      reopened_at: status === "active" ? new Date().toISOString() : undefined,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDebt(data);
}

/**
 * `occurredAt`, when provided, must already be a validated, explicit ISO
 * instant (e.g. from `bangkokDateTimeLocalToInstant`) -- this function never
 * validates or reformats it. Callers that omit it get the existing "pay now"
 * quick-pay behavior (e.g. the manual debt payment form), which is
 * unaffected by the missing-occurredAt review-flow fix. Document-review
 * confirmation (a reviewed, user-editable date/time) must always pass an
 * explicit, already-validated `occurredAt` -- never rely on this default.
 */
export async function addDebtPayment(
  userId: string,
  debtId: string,
  amountSatang: number,
  occurredAt?: string,
) {
  // A debt payment must be a real, positive payment (Category A) — zero and
  // negative amounts are rejected here before anything is persisted.
  assertMoneySatang(amountSatang, "positive", "amountSatang");

  const paidAt = occurredAt ?? new Date().toISOString();
  const debt = await getDebtForUser(userId, debtId);
  const transaction = await createTransaction(userId, {
    type: "debt_payment",
    amountSatang,
    occurredAt: paidAt,
    merchant: `ชำระ ${debt.name}`,
    debtId,
  });

  if (!isMockAuthEnabled()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("debt_payments").insert({
      user_id: userId,
      debt_id: debtId,
      transaction_id: transaction.id,
      amount_satang: amountSatang,
      paid_at: paidAt,
    });
    if (error) throw new Error(error.message);
  }

  await recalculateDebtPaidThisCycle(userId, debtId);
  const [updatedDebt] = await listDebts(userId, true).then((debts) => debts.filter((item) => item.id === debtId));
  return { debt: updatedDebt ?? debt, transaction };
}

async function getDebtForUser(userId: string, debtId: string): Promise<Debt> {
  const debt = (await listDebts(userId, true)).find((item) => item.id === debtId);
  if (!debt) throw new Error("Debt not found");
  return debt;
}

export async function recalculateDebtPaidThisCycle(userId: string, debtId: string, today = new Date()) {
  if (isMockAuthEnabled()) {
    recalculateMockDebtPaid(userId, debtId, today);
    return;
  }

  const debt = await getDebtForUser(userId, debtId);
  const cycle = getDebtCycleWindow(debt, today);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("amount_satang")
    .eq("user_id", userId)
    .eq("debt_id", debtId)
    .eq("type", "debt_payment")
    .eq("status", "confirmed")
    .gte("occurred_at", cycle.startInstant)
    .lt("occurred_at", cycle.endExclusiveInstant);
  if (error) throw new Error(error.message);
  const total = (data ?? []).reduce((sum, row) => sum + Number(row.amount_satang), 0);
  const { error: updateError } = await supabase
    .from("debts")
    .update({ amount_paid_this_cycle_satang: total })
    .eq("id", debtId)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
}

function recalculateMockDebtPaid(userId: string, debtId: string, today = new Date()) {
  const state = getMockState();
  const debt = state.debts.find((item) => item.id === debtId && item.userId === userId);
  if (!debt) return;
  const cycle = getDebtCycleWindow(debt, today);
  const start = new Date(cycle.startInstant).getTime();
  const endExclusive = new Date(cycle.endExclusiveInstant).getTime();
  debt.amountPaidThisCycleSatang = state.transactions
    .filter(
      (transaction) =>
        transaction.userId === userId &&
        transaction.debtId === debtId &&
        transaction.type === "debt_payment" &&
        transaction.status === "confirmed" &&
        new Date(transaction.occurredAt).getTime() >= start &&
        new Date(transaction.occurredAt).getTime() < endExclusive,
    )
    .reduce((sum, transaction) => sum + transaction.amountSatang, 0);
}

function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.toISOString().slice(0, 10)}T00:00:00+07:00`;
}

export async function createDocument(
  userId: string,
  input: {
    id?: string;
    status: FinanceDocument["status"];
    documentType?: string;
    storageBucket: string;
    storagePath: string;
    originalFilename?: string;
    mimeType: string;
    fileSizeBytes: number;
    errorMessage?: string;
  },
): Promise<FinanceDocument> {
  if (isMockAuthEnabled()) {
    const document: FinanceDocument = {
      id: input.id || crypto.randomUUID(),
      userId,
      status: input.status,
      documentType: input.documentType,
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      errorMessage: input.errorMessage,
      processingStartedAt: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    getMockState().documents.unshift(document);
    return document;
  }

  const supabase = await createSupabaseServerClient();
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    status: input.status,
    document_type: input.documentType,
    storage_bucket: input.storageBucket,
    storage_path: input.storagePath,
    original_filename: input.originalFilename,
    mime_type: input.mimeType,
    file_size_bytes: input.fileSizeBytes,
    error_message: input.errorMessage,
    processing_started_at: null,
  };
  if (input.id) {
    insertPayload.id = input.id;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert(insertPayload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDocument(data);
}

export async function getDocument(userId: string, id: string): Promise<FinanceDocument | null> {
  if (isMockAuthEnabled()) {
    const doc = getMockState().documents.find((d) => d.id === id && d.userId === userId);
    return doc ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDocument(data) : null;
}

export async function updateDocument(
  userId: string,
  id: string,
  input: Partial<{
    status: FinanceDocument["status"];
    documentType: string;
    errorMessage: string | null;
  }>,
): Promise<FinanceDocument> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.documents.findIndex((d) => d.id === id && d.userId === userId);
    if (index < 0) throw new Error("Document not found");
    state.documents[index] = {
      ...state.documents[index],
      status: input.status ?? state.documents[index].status,
      documentType: input.hasOwnProperty("documentType") ? input.documentType : state.documents[index].documentType,
      errorMessage: input.hasOwnProperty("errorMessage") ? (input.errorMessage ?? undefined) : state.documents[index].errorMessage,
      processingStartedAt: input.status && input.status !== "processing" ? undefined : state.documents[index].processingStartedAt,
      updatedAt: new Date().toISOString(),
    };
    return state.documents[index];
  }

  const supabase = await createSupabaseServerClient();
  const updatePayload: Record<string, unknown> = {};
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.documentType !== undefined) updatePayload.document_type = input.documentType;
  if (input.errorMessage !== undefined) updatePayload.error_message = input.errorMessage;
  if (input.status !== undefined && input.status !== "processing") updatePayload.processing_started_at = null;

  const { data, error } = await supabase
    .from("documents")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDocument(data);
}

const PROCESSABLE_DOCUMENT_STATUSES: FinanceDocument["status"][] = [
  "uploaded",
  "failed_retryable",
  "failed",
  // A successfully-extracted document that still has a review-required
  // field (e.g. missing/invalid transaction.occurredAt) must remain
  // reprocessable -- retry stays available, reusing the same document row
  // and storage object, rather than requiring a fresh upload. This does not
  // extend to the fully-clean "review_ready" state, which is unaffected by
  // this fix and keeps its existing (no-retry-needed) behavior.
  "needs_review",
];

export async function claimDocumentForProcessing(
  userId: string,
  id: string,
  options?: {
    now?: Date;
    leaseMs?: number;
  },
): Promise<FinanceDocument | null> {
  const now = options?.now ?? new Date();
  const leaseMs = options?.leaseMs ?? DOCUMENT_PROCESSING_LEASE_MS;
  const claimedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - leaseMs).toISOString();

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.documents.findIndex((d) => d.id === id && d.userId === userId);
    if (index < 0) return null;
    const current = state.documents[index];
    const isStaleProcessing =
      current.status === "processing" &&
      (!current.processingStartedAt || current.processingStartedAt < staleBefore);
    if (!PROCESSABLE_DOCUMENT_STATUSES.includes(current.status) && !isStaleProcessing) return null;
    state.documents[index] = {
      ...current,
      status: "processing",
      errorMessage: undefined,
      processingStartedAt: claimedAt,
      updatedAt: claimedAt,
    };
    return state.documents[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .update({
      status: "processing",
      error_message: null,
      processing_started_at: claimedAt,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .or(
      `status.in.(${PROCESSABLE_DOCUMENT_STATUSES.join(",")}),and(status.eq.processing,processing_started_at.lt.${staleBefore}),and(status.eq.processing,processing_started_at.is.null,updated_at.lt.${staleBefore})`,
    )
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDocument(data) : null;
}

export async function completeDocumentProcessing(
  userId: string,
  id: string,
  claimStartedAt: string,
  input: {
    documentType: string;
    // Defaults to "review_ready" (a fully-clean extraction). Callers pass
    // "needs_review" when the draft extraction is usable but still has a
    // review-required field (see processAndExtractDocument in
    // extract-document.ts) -- never "failed_permanent"/"failed_retryable"
    // for that case.
    status?: "review_ready" | "needs_review";
    now?: Date;
    leaseMs?: number;
  },
): Promise<FinanceDocument | null> {
  const now = input.now ?? new Date();
  const leaseMs = input.leaseMs ?? DOCUMENT_PROCESSING_LEASE_MS;
  const activeSince = new Date(now.getTime() - leaseMs).toISOString();
  const targetStatus = input.status ?? "review_ready";

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.documents.findIndex((d) => d.id === id && d.userId === userId);
    if (index < 0) return null;
    const current = state.documents[index];
    if (
      current.status !== "processing" ||
      current.processingStartedAt !== claimStartedAt ||
      current.processingStartedAt < activeSince
    ) {
      return null;
    }
    state.documents[index] = {
      ...current,
      status: targetStatus,
      documentType: input.documentType,
      errorMessage: undefined,
      processingStartedAt: undefined,
      updatedAt: now.toISOString(),
    };
    return state.documents[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .update({
      status: targetStatus,
      document_type: input.documentType,
      error_message: null,
      processing_started_at: null,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "processing")
    .eq("processing_started_at", claimStartedAt)
    .gte("processing_started_at", activeSince)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDocument(data) : null;
}

export async function failDocumentProcessing(
  userId: string,
  id: string,
  claimStartedAt: string,
  input: {
    status: "failed_retryable" | "failed_permanent";
    errorMessage: string;
  },
): Promise<FinanceDocument | null> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.documents.findIndex((d) => d.id === id && d.userId === userId);
    if (index < 0) return null;
    const current = state.documents[index];
    if (current.status !== "processing" || current.processingStartedAt !== claimStartedAt) return null;
    state.documents[index] = {
      ...current,
      status: input.status,
      errorMessage: input.errorMessage,
      processingStartedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    return state.documents[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .update({
      status: input.status,
      error_message: input.errorMessage,
      processing_started_at: null,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "processing")
    .eq("processing_started_at", claimStartedAt)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDocument(data) : null;
}

export async function deleteDocument(userId: string, id: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    state.documents = state.documents.filter((d) => !(d.id === id && d.userId === userId));
    state.documentExtractions = state.documentExtractions.filter((e) => !(e.documentId === id && e.userId === userId));
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function createDocumentExtraction(
  userId: string,
  input: {
    documentId: string;
    model: string;
    rawOutput: unknown;
    normalizedPreview: unknown;
    confidence?: number;
    warnings: string[];
    unclearFields: string[];
    requiresReview?: boolean;
  },
): Promise<DocumentExtraction> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    state.documentExtractions = state.documentExtractions.filter(
      (existing) => !(existing.documentId === input.documentId && existing.userId === userId),
    );
    const extraction: DocumentExtraction = {
      id: crypto.randomUUID(),
      userId,
      documentId: input.documentId,
      model: input.model,
      rawOutput: input.rawOutput,
      normalizedPreview: input.normalizedPreview,
      confidence: input.confidence,
      warnings: input.warnings,
      unclearFields: input.unclearFields,
      requiresReview: input.requiresReview ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.documentExtractions.unshift(extraction);
    return extraction;
  }

  const supabase = await createSupabaseServerClient();
  const { error: deleteError } = await supabase
    .from("document_extractions")
    .delete()
    .eq("document_id", input.documentId)
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  const { data, error } = await supabase
    .from("document_extractions")
    .insert({
      user_id: userId,
      document_id: input.documentId,
      model: input.model,
      raw_output: input.rawOutput,
      normalized_preview: input.normalizedPreview,
      confidence: input.confidence,
      warnings: input.warnings,
      unclear_fields: input.unclearFields,
      requires_review: input.requiresReview ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapDocumentExtraction(data);
}

export async function getDocumentExtraction(
  userId: string,
  documentId: string,
): Promise<DocumentExtraction | null> {
  if (isMockAuthEnabled()) {
    const ext = getMockState().documentExtractions.find((e) => e.documentId === documentId && e.userId === userId);
    return ext ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_extractions")
    .select("*")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDocumentExtraction(data) : null;
}

export async function listRecentConfirmedTransactions(userId: string): Promise<Transaction[]> {
  if (isMockAuthEnabled()) {
    return getMockState().transactions
      .filter((tx) => tx.userId === userId && tx.status === "confirmed")
      .slice(0, 100);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransaction);
}

export async function listDuplicateCandidates(
  userId: string,
  amounts: number[],
  refNumbers: string[]
): Promise<Transaction[]> {
  if (amounts.length === 0) return [];

  if (isMockAuthEnabled()) {
    const amountsSet = new Set(amounts);
    const refNumbersSet = new Set(refNumbers.filter(Boolean));
    return getMockState().transactions.filter(
      (tx) =>
        tx.userId === userId &&
        tx.status === "confirmed" &&
        (amountsSet.has(tx.amountSatang) || (tx.referenceNumber && refNumbersSet.has(tx.referenceNumber)))
    );
  }

  const supabase = await createSupabaseServerClient();
  const cleanRefNumbers = refNumbers.filter(Boolean);
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "confirmed");

  if (cleanRefNumbers.length > 0) {
    query = query.or(`amount_satang.in.(${amounts.join(",")}),reference_number.in.(${cleanRefNumbers.join(",")})`);
  } else {
    query = query.in("amount_satang", amounts);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTransaction);
}

// === History Import Batches Repository ===

export async function createImportBatch(
  userId: string,
  input: {
    sourceType: string;
    sourceName?: string;
    accountId?: string;
    originalFilename?: string;
    storagePath: string;
    mimeType: string;
    fileSize: number;
    periodStart?: string;
    periodEnd?: string;
    statementDate?: string;
  },
): Promise<ImportBatch> {
  if (input.accountId) await assertAccountBelongsToUser(userId, input.accountId);

  if (isMockAuthEnabled()) {
    const batch: ImportBatch = {
      id: crypto.randomUUID(),
      userId,
      sourceType: input.sourceType,
      sourceName: input.sourceName,
      accountId: input.accountId,
      originalFilename: input.originalFilename,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      statementDate: input.statementDate,
      status: "uploaded",
      totalRows: 0,
      parsedRows: 0,
      readyRows: 0,
      duplicateRows: 0,
      reviewRows: 0,
      skippedRows: 0,
      importedRows: 0,
      failedRows: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    getMockState().importBatches.unshift(batch);
    return batch;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      user_id: userId,
      source_type: input.sourceType,
      source_name: input.sourceName,
      account_id: input.accountId,
      original_filename: input.originalFilename,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      statement_date: input.statementDate,
      status: "uploaded",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapImportBatch(data);
}

export async function getImportBatch(userId: string, id: string): Promise<ImportBatch | null> {
  if (isMockAuthEnabled()) {
    const batch = getMockState().importBatches.find((b) => b.id === id && b.userId === userId);
    return batch ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(IMPORT_BATCH_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapImportBatch(data) : null;
}

export async function updateImportBatch(
  userId: string,
  id: string,
  input: Partial<Omit<ImportBatch, "id" | "userId" | "createdAt" | "updatedAt">>,
): Promise<ImportBatch> {
  if (input.accountId) await assertAccountBelongsToUser(userId, input.accountId);

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const idx = state.importBatches.findIndex((b) => b.id === id && b.userId === userId);
    if (idx < 0) throw new Error("Import batch not found");
    state.importBatches[idx] = {
      ...state.importBatches[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    } as ImportBatch;
    return state.importBatches[idx];
  }

  const supabase = await createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (input.status !== undefined) payload.status = input.status;
  if (input.totalRows !== undefined) payload.total_rows = input.totalRows;
  if (input.parsedRows !== undefined) payload.parsed_rows = input.parsedRows;
  if (input.readyRows !== undefined) payload.ready_rows = input.readyRows;
  if (input.duplicateRows !== undefined) payload.duplicate_rows = input.duplicateRows;
  if (input.reviewRows !== undefined) payload.review_rows = input.reviewRows;
  if (input.skippedRows !== undefined) payload.skipped_rows = input.skippedRows;
  if (input.importedRows !== undefined) payload.imported_rows = input.importedRows;
  if (input.accountId !== undefined) payload.account_id = input.accountId;
  if (input.periodStart !== undefined) payload.period_start = input.periodStart;
  if (input.periodEnd !== undefined) payload.period_end = input.periodEnd;
  if (input.completedAt !== undefined) payload.completed_at = input.completedAt;
  if (input.rolledBackAt !== undefined) payload.rolled_back_at = input.rolledBackAt;
  if (input.parserName !== undefined) payload.parser_name = input.parserName;
  if (input.parserVersion !== undefined) payload.parser_version = input.parserVersion;
  if (input.statementMetadata !== undefined) payload.statement_metadata = input.statementMetadata;
  if (input.detectedLayout !== undefined) payload.detected_layout = input.detectedLayout;
  if (input.pageCount !== undefined) payload.page_count = input.pageCount;

  const { data, error } = await supabase
    .from("import_batches")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapImportBatch(data);
}

export async function listImportBatches(userId: string): Promise<ImportBatch[]> {
  if (isMockAuthEnabled()) {
    return getMockState().importBatches.filter((b) => b.userId === userId);
  }

  const { data, error } = await timeAsync("query.import_batches", async () => {
    const supabase = await createSupabaseServerClient();
    return supabase
      .from("import_batches")
      .select(IMPORT_BATCH_LIST_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
  }, { userId });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapImportBatch);
}

export async function deleteImportBatch(userId: string, id: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    state.importBatches = state.importBatches.filter((b) => !(b.id === id && b.userId === userId));
    state.importRows = state.importRows.filter((r) => !(r.importBatchId === id && r.userId === userId));
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("import_batches")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// === History Import Staging Rows Repository ===

export async function createImportRows(
  userId: string,
  rows: Omit<ImportRow, "id" | "createdAt" | "updatedAt">[],
): Promise<ImportRow[]> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const created: ImportRow[] = rows.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    state.importRows.push(...created);
    return created;
  }

  const supabase = await createSupabaseServerClient();
  const payloads = rows.map((r) => ({
    user_id: userId,
    import_batch_id: r.importBatchId,
    source_row_index: r.sourceRowIndex,
    raw_text: r.rawText,
    raw_data: r.rawData,
    occurred_at: r.occurredAt,
    posted_at: r.postedAt,
    description: r.description,
    merchant: r.merchant,
    amount_satang: r.amountSatang,
    direction: r.direction,
    running_balance_satang: r.runningBalanceSatang,
    currency: r.currency,
    reference_number: r.referenceNumber,
    source_account_last_four: r.sourceAccountLastFour,
    destination_account_last_four: r.destinationAccountLastFour,
    suggested_transaction_type: r.suggestedTransactionType,
    suggested_category: r.suggestedCategory,
    suggested_debt_id: r.suggestedDebtId,
    suggested_account_id: r.suggestedAccountId,
    confidence: r.confidence,
    duplicate_score: r.duplicateScore,
    duplicate_transaction_id: r.duplicateTransactionId,
    review_status: r.reviewStatus,
    import_decision: r.importDecision,
    validation_warnings: r.validationWarnings,
    page_number: r.pageNumber,
    source_line_start: r.sourceLineStart,
    source_line_end: r.sourceLineEnd,
    parser_source: r.parserSource,
    parser_confidence: r.parserConfidence,
    row_fingerprint: r.rowFingerprint,
  }));

  const { data, error } = await supabase
    .from("import_rows")
    .insert(payloads)
    .select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapImportRow);
}

export async function listImportRows(userId: string, importBatchId: string): Promise<ImportRow[]> {
  if (isMockAuthEnabled()) {
    return getMockState().importRows
      .filter((r) => r.importBatchId === importBatchId && r.userId === userId)
      .sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_rows")
    .select("*")
    .eq("import_batch_id", importBatchId)
    .eq("user_id", userId)
    .order("source_row_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapImportRow);
}

export async function updateImportRow(
  userId: string,
  id: string,
  input: Partial<Omit<ImportRow, "id" | "userId" | "importBatchId" | "createdAt" | "updatedAt">>,
): Promise<ImportRow> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const idx = state.importRows.findIndex((r) => r.id === id && r.userId === userId);
    if (idx < 0) throw new Error("Staging row not found");
    state.importRows[idx] = {
      ...state.importRows[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    } as ImportRow;
    return state.importRows[idx];
  }

  const supabase = await createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (input.reviewStatus !== undefined) payload.review_status = input.reviewStatus;
  if (input.importDecision !== undefined) payload.import_decision = input.importDecision;
  if (input.suggestedTransactionType !== undefined) payload.suggested_transaction_type = input.suggestedTransactionType;
  if (input.suggestedCategory !== undefined) payload.suggested_category = input.suggestedCategory;
  if (input.suggestedDebtId !== undefined) payload.suggested_debt_id = input.suggestedDebtId;
  if (input.createdTransactionId !== undefined) payload.created_transaction_id = input.createdTransactionId;
  if (input.amountSatang !== undefined) payload.amount_satang = input.amountSatang;
  if (input.merchant !== undefined) payload.merchant = input.merchant;
  if (input.description !== undefined) payload.description = input.description;

  const { data, error } = await supabase
    .from("import_rows")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapImportRow(data);
}

// === History Staging Batch Commit Logic ===

function isRowResolved(row: ImportRow): boolean {
  return row.reviewStatus === "imported" || row.reviewStatus === "skipped";
}

/**
 * Commits exactly one staging row's "import" decision, synchronously, with
 * no `await` between the resolved-state check and the mutation. JS is
 * single-threaded and only yields at `await` points, so a function body
 * with none is atomic with respect to any other concurrently-running async
 * call into the mock store -- this mirrors the row-level locking the real
 * `import_commit_row` Postgres function provides via `select ... for update`.
 */
function commitImportRowMock(
  userId: string,
  batchId: string,
  rowId: string,
  type: Transaction["type"],
  amountSatang: number,
  occurredAt: string,
  merchant: string | undefined,
  category: string | undefined,
  sourceAccountId: string | undefined,
  destinationAccountId: string | undefined,
  debtId: string | undefined,
): { transactionId: string; alreadyImported: boolean } {
  const state = getMockState();
  const rowIdx = state.importRows.findIndex(
    (r) => r.id === rowId && r.userId === userId && r.importBatchId === batchId,
  );
  if (rowIdx < 0) throw new Error("Staging row not found");
  const row = state.importRows[rowIdx];

  if (isRowResolved(row)) {
    return { transactionId: row.createdTransactionId ?? "", alreadyImported: true };
  }

  if (debtId) {
    const debt = state.debts.find((d) => d.id === debtId && d.userId === userId);
    if (!debt) throw new Error("Debt not found");
  }

  assertMoneySatang(amountSatang, type === "debt_payment" ? "positive" : "nonnegative", "amountSatang");

  const transaction: Transaction = {
    id: crypto.randomUUID(),
    userId,
    type,
    status: "confirmed",
    amountSatang,
    currency: "THB",
    occurredAt,
    merchant,
    category,
    debtId,
    source: "history_import",
    sourceAccountId,
    destinationAccountId,
    importBatchId: batchId,
    importRowId: rowId,
    isHistorical: true,
  };
  state.transactions.unshift(transaction);
  if (debtId) recalculateMockDebtPaid(userId, debtId);

  state.importRows[rowIdx] = {
    ...row,
    createdTransactionId: transaction.id,
    reviewStatus: "imported",
    importDecision: "import",
    updatedAt: new Date().toISOString(),
  };

  return { transactionId: transaction.id, alreadyImported: false };
}

/**
 * Real-DB counterpart of `commitImportRowMock`: delegates the entire
 * lock-check-insert-link sequence to the `import_commit_row` Postgres
 * function (202607110002_history_import_idempotency.sql), which performs it
 * as a single atomic operation using `select ... for update` row locking --
 * safe against concurrent commit requests for the same row without any
 * application-level mutex.
 */
async function commitImportRowRpc(
  userId: string,
  batchId: string,
  rowId: string,
  type: Transaction["type"],
  amountSatang: number,
  occurredAt: string,
  merchant: string | undefined,
  category: string | undefined,
  sourceAccountId: string | undefined,
  destinationAccountId: string | undefined,
  debtId: string | undefined,
): Promise<{ transactionId: string; alreadyImported: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("import_commit_row", {
    p_user_id: userId,
    p_batch_id: batchId,
    p_row_id: rowId,
    p_type: type,
    p_amount_satang: amountSatang,
    p_occurred_at: occurredAt,
    p_merchant: merchant ?? null,
    p_category: category ?? null,
    p_payment_method: null,
    p_note: null,
    p_source_account_id: sourceAccountId ?? null,
    p_destination_account_id: destinationAccountId ?? null,
    p_debt_id: debtId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { transaction_id: string; already_imported: boolean }
    | undefined;
  if (!row) throw new Error("Import commit did not return a result");
  return { transactionId: row.transaction_id, alreadyImported: row.already_imported };
}

async function commitImportRow(
  userId: string,
  batchId: string,
  rowId: string,
  type: Transaction["type"],
  amountSatang: number,
  occurredAt: string,
  merchant: string | undefined,
  category: string | undefined,
  sourceAccountId: string | undefined,
  destinationAccountId: string | undefined,
  debtId: string | undefined,
): Promise<{ transactionId: string; alreadyImported: boolean }> {
  // Validate independently of whatever the client already checked, using
  // the same financial value guards and locked debt_payment-linkage
  // invariant as every other write path (createTransaction/
  // updateTransaction). Import review is not exempt: a debt_payment row
  // reaching commit without a debt_id must be rejected here, not silently
  // confirmed as an unlinked cashflow transaction (see F-001 in
  // docs/SLIP_DEBT_FINAL_SECURITY_AUDIT.md).
  assertMoneySatang(amountSatang, type === "debt_payment" ? "positive" : "nonnegative", "amountSatang");
  assertDebtPaymentLinked(type, debtId);
  if (debtId) await assertDebtBelongsToUser(userId, debtId);
  if (sourceAccountId) await assertAccountBelongsToUser(userId, sourceAccountId);
  if (destinationAccountId) await assertAccountBelongsToUser(userId, destinationAccountId);

  if (isMockAuthEnabled()) {
    return commitImportRowMock(
      userId,
      batchId,
      rowId,
      type,
      amountSatang,
      occurredAt,
      merchant,
      category,
      sourceAccountId,
      destinationAccountId,
      debtId,
    );
  }
  return commitImportRowRpc(
    userId,
    batchId,
    rowId,
    type,
    amountSatang,
    occurredAt,
    merchant,
    category,
    sourceAccountId,
    destinationAccountId,
    debtId,
  );
}

/**
 * Updates a staging row's terminal status (skip / merge link) only if it is
 * not already resolved. The `.not("review_status", "in", ...)` clause makes
 * the underlying UPDATE itself the concurrency guard: Postgres locks the
 * matching row for the statement's duration, so two concurrent calls for
 * the same row_id serialize, and whichever runs second sees the row already
 * resolved and matches zero rows (a safe, silent no-op) rather than
 * clobbering the first call's result.
 */
async function updateImportRowIfUnresolved(
  userId: string,
  id: string,
  input: Partial<Pick<ImportRow, "reviewStatus" | "importDecision" | "createdTransactionId">>,
): Promise<void> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const idx = state.importRows.findIndex((r) => r.id === id && r.userId === userId);
    if (idx < 0) throw new Error("Staging row not found");
    if (isRowResolved(state.importRows[idx])) return;
    state.importRows[idx] = {
      ...state.importRows[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    } as ImportRow;
    return;
  }

  const supabase = await createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (input.reviewStatus !== undefined) payload.review_status = input.reviewStatus;
  if (input.importDecision !== undefined) payload.import_decision = input.importDecision;
  if (input.createdTransactionId !== undefined) payload.created_transaction_id = input.createdTransactionId;

  const { error } = await supabase
    .from("import_rows")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .not("review_status", "in", '("imported","skipped")');
  if (error) throw new Error(error.message);
}

export type ImportRowFailure = { rowId: string; message: string };

export async function importReviewedRows(
  userId: string,
  batchId: string,
  accountId: string | undefined,
  rowDecisions: {
    rowId: string;
    decision: "import" | "merge_existing" | "skip";
    transactionType?: Transaction["type"];
    category?: string;
    debtId?: string;
    occurredAt?: string;
    merchant?: string;
    amountSatang?: number;
    duplicateTransactionId?: string;
  }[],
): Promise<{
  importedCount: number;
  mergedCount: number;
  skippedCount: number;
  failedCount: number;
  remainingCount: number;
  failures: ImportRowFailure[];
}> {
  // Fail fast and cleanly if this batch does not belong to the caller,
  // rather than letting a foreign batchId silently no-op through every
  // per-row check and only surface as an obscure error from the batch
  // counter update at the very end.
  const batch = await getImportBatch(userId, batchId);
  if (!batch) {
    throw new Error("ไม่พบชุดนำเข้าข้อมูล");
  }

  if (accountId) await assertAccountBelongsToUser(userId, accountId);

  // Read the row states once, up front, so idempotency decisions for this
  // call are based on a single consistent snapshot rather than re-reading
  // (and potentially observing a different state) row by row.
  const existingRows = await listImportRows(userId, batchId);
  const rowById = new Map(existingRows.map((r) => [r.id, r]));

  let importedCount = 0;
  let mergedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failures: ImportRowFailure[] = [];

  for (const dec of rowDecisions) {
    const existing = rowById.get(dec.rowId);
    if (!existing) {
      failedCount++;
      failures.push({ rowId: dec.rowId, message: "ไม่พบรายการนี้ในชุดข้อมูล" });
      continue;
    }

    // Idempotency: a row already resolved (imported, merged, or skipped) by
    // this call or an earlier one is frozen -- retries, double submits, and
    // concurrent requests must never re-process it, regardless of what
    // decision this particular request sends for it.
    if (isRowResolved(existing)) {
      if (existing.reviewStatus === "imported") {
        if (existing.importDecision === "merge_existing") mergedCount++;
        else importedCount++;
      } else {
        skippedCount++;
      }
      continue;
    }

    try {
      if (dec.decision === "import") {
        const type = dec.transactionType || "expense";
        const amount = dec.amountSatang || 0;
        const sourceAccountId = type === "expense" || type === "transfer" ? accountId : undefined;
        const destinationAccountId = type === "income" || type === "transfer" ? accountId : undefined;

        await commitImportRow(
          userId,
          batchId,
          dec.rowId,
          type,
          amount,
          dec.occurredAt || new Date().toISOString(),
          dec.merchant,
          dec.category,
          sourceAccountId,
          destinationAccountId,
          dec.debtId,
        );
        importedCount++;
      } else if (dec.decision === "merge_existing" && dec.duplicateTransactionId) {
        await updateTransaction(userId, dec.duplicateTransactionId, {
          importBatchId: batchId,
          importRowId: dec.rowId,
        });
        await updateImportRowIfUnresolved(userId, dec.rowId, {
          reviewStatus: "imported",
          importDecision: "merge_existing",
          createdTransactionId: dec.duplicateTransactionId,
        });
        mergedCount++;
      } else if (dec.decision === "skip") {
        await updateImportRowIfUnresolved(userId, dec.rowId, {
          reviewStatus: "skipped",
          importDecision: "skip",
        });
        skippedCount++;
      }
    } catch (error) {
      // A single row's failure must not abort the rest of the batch, and
      // must not be reported as if the whole commit succeeded. The row
      // itself is left in whatever state it was in (still unresolved), so
      // a retry will naturally re-attempt exactly this row and no others.
      failedCount++;
      const safeMessage = error instanceof Error ? error.message : "นำเข้ารายการนี้ไม่สำเร็จ";
      failures.push({ rowId: dec.rowId, message: safeMessage });
      logSafeError("Import row commit failed", {
        operation: "history-import",
        stage: "confirm.row",
        batchId,
        error,
      });
    }
  }

  // Always recompute batch counters from the actual current row state
  // (never accumulate deltas onto whatever was previously stored) so this
  // is correct and idempotent no matter how many times, or how partially,
  // this function has been called for this batch.
  const finalRows = await listImportRows(userId, batchId);
  const importedTotal = finalRows.filter((r) => r.reviewStatus === "imported").length;
  const skippedTotal = finalRows.filter((r) => r.reviewStatus === "skipped").length;
  const unresolvedCount = finalRows.filter((r) => r.importDecision === "unresolved").length;
  const status = unresolvedCount === 0 ? "completed" : "partially_imported";

  await updateImportBatch(userId, batchId, {
    importedRows: importedTotal,
    skippedRows: skippedTotal,
    status,
    completedAt: new Date().toISOString(),
    accountId,
  });

  return { importedCount, mergedCount, skippedCount, failedCount, remainingCount: unresolvedCount, failures };
}

// === History Staging Batch Rollback Logic ===

export async function rollbackImportBatch(userId: string, batchId: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const state = getMockState();

    // Idempotency: already rolled back — safe no-op
    const batch = state.importBatches.find((b) => b.id === batchId && b.userId === userId);
    if (!batch) throw new Error("ไม่พบชุดนำเข้าข้อมูล");
    if (batch.status === "rolled_back") return; // safe re-entry
    if (batch.status !== "completed" && batch.status !== "partially_imported") {
      throw new Error("ไม่สามารถ Rollback ชุดข้อมูลที่ยังไม่ได้นำเข้า");
    }

    // 1. Delete transactions created by this batch
    const targetTxs = state.transactions.filter(
      (tx) => tx.importBatchId === batchId && tx.isHistorical === true && tx.userId === userId
    );
    const targetTxIds = targetTxs.map((tx) => tx.id);
    const affectedDebtIds = Array.from(
      new Set(targetTxs.map((tx) => tx.debtId).filter((id): id is string => Boolean(id))),
    );

    // In mock store, delete transactions
    state.transactions = state.transactions.filter((tx) => !targetTxIds.includes(tx.id));

    // 2. Unlink pre-existing merged transactions
    state.transactions.forEach((tx) => {
      if (tx.importBatchId === batchId && tx.userId === userId) {
        tx.importBatchId = undefined;
        tx.importRowId = undefined;
      }
    });

    // 3. Reset staging rows
    state.importRows.forEach((row) => {
      if (row.importBatchId === batchId && row.userId === userId) {
        row.reviewStatus = "ready";
        row.importDecision = "unresolved";
        row.createdTransactionId = undefined;
      }
    });

    // 3b. Recalculate cached debt totals now that their historical
    // debt-payment transactions no longer exist.
    affectedDebtIds.forEach((debtId) => recalculateMockDebtPaid(userId, debtId));

    // 4. Set batch status
    const batchIdx = state.importBatches.findIndex((b) => b.id === batchId && b.userId === userId);
    if (batchIdx >= 0) {
      state.importBatches[batchIdx] = {
        ...state.importBatches[batchIdx],
        status: "rolled_back",
        importedRows: 0,
        skippedRows: 0,
        rolledBackAt: new Date().toISOString(),
      };
    }
    return;
  }

  // The entire rollback sequence (delete debt_payments, delete historical
  // transactions, unlink merged transactions, reset staging rows,
  // recalculate affected debts, mark the batch rolled_back) is delegated to
  // the import_rollback_batch Postgres function
  // (202607110002_history_import_idempotency.sql) so it commits or fails as
  // a single atomic unit -- a crash between steps can no longer leave
  // import_rows pointing at deleted transactions with the batch still
  // showing 'completed'.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("import_rollback_batch", {
    p_user_id: userId,
    p_batch_id: batchId,
  });
  if (error) {
    if (error.message.includes("import batch not found")) {
      throw new Error("ไม่พบชุดนำเข้าข้อมูล");
    }
    if (error.message.includes("cannot roll back a batch")) {
      throw new Error("ไม่สามารถ Rollback ชุดข้อมูลที่ยังไม่ได้นำเข้า");
    }
    throw new Error(error.message);
  }
}

export async function listAccounts(userId: string): Promise<Account[]> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    if (state.accounts.length === 0) {
      state.accounts = [
        { id: "acc-1", userId, name: "KBank Savings", isOwnedByUser: true, accountLastFour: "1234" },
        { id: "acc-2", userId, name: "SCB Easy", isOwnedByUser: true, accountLastFour: "4321" },
        { id: "acc-3", userId, name: "KTC Credit Card", isOwnedByUser: true, accountLastFour: "8888" },
      ];
    }
    return state.accounts.filter((account) => account.userId === userId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    isOwnedByUser: row.is_owned_by_user as boolean,
    accountLastFour: (row.account_last_four as string | null) ?? undefined,
  }));
}

export async function createAccount(
  userId: string,
  input: { name: string; isOwnedByUser?: boolean; accountLastFour?: string },
): Promise<Account> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const acc: Account = {
      id: crypto.randomUUID(),
      userId,
      name: input.name,
      isOwnedByUser: input.isOwnedByUser ?? true,
      accountLastFour: input.accountLastFour,
    };
    state.accounts.push(acc);
    return acc;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      name: input.name,
      is_owned_by_user: input.isOwnedByUser ?? true,
      account_last_four: input.accountLastFour,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    isOwnedByUser: data.is_owned_by_user,
    accountLastFour: data.account_last_four ?? undefined,
  };
}


// === Monthly Budget Repository ===

const MONTHLY_BUDGET_COLUMNS = "id, user_id, month, income_satang, strategy, status, created_at, updated_at";
const BUDGET_CATEGORY_COLUMNS = "id, user_id, monthly_budget_id, label, amount_satang, created_at, updated_at";

function assertValidMonth(month: string): void {
  if (!isValidMonthQuery(month)) {
    throw new Error("Invalid month");
  }
}

export async function getMonthlyBudget(userId: string, month: string): Promise<MonthlyBudget | null> {
  assertValidMonth(month);

  if (isMockAuthEnabled()) {
    const budget = getMockState().monthlyBudgets.find((b) => b.userId === userId && b.month === month);
    return budget ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("monthly_budgets")
    .select(MONTHLY_BUDGET_COLUMNS)
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapMonthlyBudget(data) : null;
}

/**
 * Creates the monthly budget for a month if it does not exist yet, or
 * updates its expected income if it does -- this single operation covers
 * both "first-time monthly budget setup" and "edit monthly income" without
 * risking a duplicate-row race, since the underlying table has a unique
 * (user_id, month) constraint. A concurrent duplicate insert attempt is
 * caught and safely resolved by re-reading and updating instead of erroring.
 */
export async function upsertMonthlyBudget(
  userId: string,
  month: string,
  incomeSatang: number,
): Promise<MonthlyBudget> {
  assertValidMonth(month);
  assertMoneySatang(incomeSatang, "nonnegative", "incomeSatang");

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.monthlyBudgets.findIndex((b) => b.userId === userId && b.month === month);
    if (index >= 0) {
      state.monthlyBudgets[index] = {
        ...state.monthlyBudgets[index],
        incomeSatang,
        updatedAt: new Date().toISOString(),
      };
      return state.monthlyBudgets[index];
    }
    const budget: MonthlyBudget = {
      id: crypto.randomUUID(),
      userId,
      month,
      incomeSatang,
      strategy: "minimum_first",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.monthlyBudgets.push(budget);
    return budget;
  }

  const supabase = await createSupabaseServerClient();
  const existing = await getMonthlyBudget(userId, month);
  if (existing) {
    const { data, error } = await supabase
      .from("monthly_budgets")
      .update({ income_satang: incomeSatang })
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select(MONTHLY_BUDGET_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapMonthlyBudget(data);
  }

  const { data, error } = await supabase
    .from("monthly_budgets")
    .insert({ user_id: userId, month, income_satang: incomeSatang })
    .select(MONTHLY_BUDGET_COLUMNS)
    .single();
  if (error) {
    // Lost a create race to a concurrent request -- fall back to updating
    // the now-existing row instead of failing.
    if (error.code === "23505") {
      const recheck = await getMonthlyBudget(userId, month);
      if (recheck) {
        const { data: updated, error: updateError } = await supabase
          .from("monthly_budgets")
          .update({ income_satang: incomeSatang })
          .eq("id", recheck.id)
          .eq("user_id", userId)
          .select(MONTHLY_BUDGET_COLUMNS)
          .single();
        if (updateError) throw new Error(updateError.message);
        return mapMonthlyBudget(updated);
      }
    }
    throw new Error(error.message);
  }
  return mapMonthlyBudget(data);
}

export async function listBudgetCategories(userId: string, monthlyBudgetId: string): Promise<BudgetCategory[]> {
  if (isMockAuthEnabled()) {
    return getMockState()
      .budgetCategories.filter((c) => c.userId === userId && c.monthlyBudgetId === monthlyBudgetId)
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("budget_categories")
    .select(BUDGET_CATEGORY_COLUMNS)
    .eq("user_id", userId)
    .eq("monthly_budget_id", monthlyBudgetId)
    .order("label", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBudgetCategory);
}

export async function createBudgetCategory(
  userId: string,
  monthlyBudgetId: string,
  label: string,
  amountSatang: number,
): Promise<BudgetCategory> {
  assertMoneySatang(amountSatang, "nonnegative", "amountSatang");
  const trimmedLabel = label.trim();

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const budget = state.monthlyBudgets.find((b) => b.id === monthlyBudgetId && b.userId === userId);
    if (!budget) throw new Error(BUDGET_ERROR_NOT_FOUND_TH);
    const duplicate = state.budgetCategories.some(
      (c) => c.userId === userId && c.monthlyBudgetId === monthlyBudgetId && c.label === trimmedLabel,
    );
    if (duplicate) throw new Error(BUDGET_ERROR_DUPLICATE_TH);
    const category: BudgetCategory = {
      id: crypto.randomUUID(),
      userId,
      monthlyBudgetId,
      label: trimmedLabel,
      amountSatang,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.budgetCategories.push(category);
    return category;
  }

  const supabase = await createSupabaseServerClient();
  const { data: budget, error: budgetError } = await supabase
    .from("monthly_budgets")
    .select("id")
    .eq("id", monthlyBudgetId)
    .eq("user_id", userId)
    .maybeSingle();
  if (budgetError) throw new Error(budgetError.message);
  if (!budget) throw new Error(BUDGET_ERROR_NOT_FOUND_TH);

  const { data, error } = await supabase
    .from("budget_categories")
    .insert({ user_id: userId, monthly_budget_id: monthlyBudgetId, label: trimmedLabel, amount_satang: amountSatang })
    .select(BUDGET_CATEGORY_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(BUDGET_ERROR_DUPLICATE_TH);
    throw new Error(error.message);
  }
  return mapBudgetCategory(data);
}

export async function updateBudgetCategory(
  userId: string,
  id: string,
  amountSatang: number,
): Promise<BudgetCategory> {
  assertMoneySatang(amountSatang, "nonnegative", "amountSatang");

  if (isMockAuthEnabled()) {
    const state = getMockState();
    const index = state.budgetCategories.findIndex((c) => c.id === id);
    if (index < 0) throw new Error(BUDGET_ERROR_NOT_FOUND_TH);
    assertOwner(userId, state.budgetCategories[index].userId);
    state.budgetCategories[index] = {
      ...state.budgetCategories[index],
      amountSatang,
      updatedAt: new Date().toISOString(),
    };
    return state.budgetCategories[index];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("budget_categories")
    .update({ amount_satang: amountSatang })
    .eq("id", id)
    .eq("user_id", userId)
    .select(BUDGET_CATEGORY_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(BUDGET_ERROR_NOT_FOUND_TH);
  return mapBudgetCategory(data);
}

export async function deleteBudgetCategory(userId: string, id: string): Promise<void> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const existing = state.budgetCategories.find((c) => c.id === id);
    if (!existing) return;
    assertOwner(userId, existing.userId);
    state.budgetCategories = state.budgetCategories.filter((c) => c.id !== id);
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("budget_categories").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export type CopyPreviousMonthResult = {
  budget: MonthlyBudget;
  copiedCount: number;
  skippedCount: number;
};

/**
 * Copies a prior month's category budget allocations -- and only category
 * allocations -- into the target month. Expected monthly income is
 * deliberately month-specific and is never copied from the source month:
 * a newly created target budget starts at income 0 (the user must set it
 * separately), and an already-existing target budget's income is left
 * completely untouched -- `upsertMonthlyBudget` (which unconditionally
 * overwrites income) is only ever called when no target budget exists yet,
 * so there is no code path here that can read-then-write-back a target's
 * income and risk clobbering a concurrent income change.
 *
 * Idempotent: categories already present in the target (by label) are
 * counted as skipped, never duplicated -- both when detected up front and
 * when a concurrent/retried call races on the underlying unique
 * constraint. A concurrent "two copies race to create the target budget"
 * case is likewise safe, since every copy call seeds a newly created
 * target at income 0 -- whichever call wins the race, the result is the
 * same value.
 */
export async function copyPreviousMonthBudget(
  userId: string,
  fromMonth: string,
  toMonth: string,
): Promise<CopyPreviousMonthResult> {
  assertValidMonth(fromMonth);
  assertValidMonth(toMonth);

  const sourceBudget = await getMonthlyBudget(userId, fromMonth);
  if (!sourceBudget) throw new Error(BUDGET_ERROR_NOT_FOUND_TH);

  const existingTargetBudget = await getMonthlyBudget(userId, toMonth);
  const targetBudget = existingTargetBudget ?? (await upsertMonthlyBudget(userId, toMonth, 0));

  const sourceCategories = await listBudgetCategories(userId, sourceBudget.id);
  const targetCategories = await listBudgetCategories(userId, targetBudget.id);
  const existingLabels = new Set(targetCategories.map((c) => c.label));

  let copiedCount = 0;
  let skippedCount = 0;
  for (const category of sourceCategories) {
    if (existingLabels.has(category.label)) {
      skippedCount++;
      continue;
    }
    try {
      await createBudgetCategory(userId, targetBudget.id, category.label, category.amountSatang);
      copiedCount++;
    } catch (error) {
      if (error instanceof Error && error.message === BUDGET_ERROR_DUPLICATE_TH) {
        // Lost a race to a concurrent copy/create -- already present, not an error.
        skippedCount++;
        continue;
      }
      throw error;
    }
  }

  return { budget: targetBudget, copiedCount, skippedCount };
}
