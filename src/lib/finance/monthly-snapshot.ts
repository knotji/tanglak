import { getMonthlyBudget, listBudgetCategories, listTransactions } from "@/lib/data/finance-repository";
import { buildBudgetSummary, type BudgetSummary } from "./budget-calculations";
import { calculateMonthlyTotals, type MonthlyTotals } from "./calculations";
import type { MonthlyBudget, Transaction } from "@/types/domain";

export type MonthlyFinanceSnapshot = {
  month: string;
  /** Confirmed and unconfirmed transactions for this Bangkok-local month, from the one canonical DB-scoped query. */
  transactions: Transaction[];
  /** The raw monthly_budgets row for this month, or null if the user hasn't created one yet. */
  monthlyBudget: MonthlyBudget | null;
  totals: MonthlyTotals;
  budgetSummary: BudgetSummary;
};

/**
 * The single canonical "this month's finance data" loader. Every page that
 * needs monthly transactions, totals, or budget/category status (Today,
 * Overview, Budget) must call this instead of independently fetching and
 * filtering transactions.
 *
 * This exists because of a real production bug: Overview and Budget used to
 * call listAllTransactions() (every transaction, all time) and then filter
 * client-side with a naive `occurredAt.startsWith(month)` string check,
 * while Today used listTransactions(userId, month) -- a proper Bangkok-
 * offset-aware DB range query. Supabase returns `occurred_at` normalized to
 * UTC, so the naive prefix filter silently dropped or misfiled any
 * transaction whose Bangkok wall-clock date differs from its UTC calendar
 * date (i.e. anything from 00:00-06:59 Bangkok time) -- causing Overview
 * and Budget to undercount transactions that Today and Transactions counted
 * correctly. listTransactions() already avoids this; this helper makes it
 * the only path, so no page can reintroduce the mismatch.
 */
export async function getMonthlyFinanceSnapshot(userId: string, month: string): Promise<MonthlyFinanceSnapshot> {
  const [transactions, monthlyBudget] = await Promise.all([
    listTransactions(userId, month),
    getMonthlyBudget(userId, month),
  ]);
  const categories = monthlyBudget ? await listBudgetCategories(userId, monthlyBudget.id) : [];
  const totals = calculateMonthlyTotals(transactions, month);
  const budgetSummary = buildBudgetSummary(month, monthlyBudget, categories, transactions);
  return { month, transactions, monthlyBudget, totals, budgetSummary };
}
