import type { BudgetCategory, Debt, MonthlyBudget, Transaction } from "@/types/domain";

export const USER_ID = "financial-integrity-user";
export const OTHER_USER_ID = "financial-integrity-other-user";
export const JULY_2026 = "2026-07";

export function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? `tx-${Math.random().toString(36).slice(2)}`,
    userId: USER_ID,
    type: "expense",
    status: "confirmed",
    amountSatang: 10_000,
    currency: "THB",
    occurredAt: "2026-07-10T12:00:00+07:00",
    source: "manual",
    ...overrides,
  };
}

export function budget(overrides: Partial<MonthlyBudget> = {}): MonthlyBudget {
  return {
    id: "budget-july-2026",
    userId: USER_ID,
    month: JULY_2026,
    incomeSatang: 300_000,
    strategy: "minimum_first",
    status: "draft",
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

export function budgetCategory(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: overrides.id ?? `budget-category-${Math.random().toString(36).slice(2)}`,
    userId: USER_ID,
    monthlyBudgetId: "budget-july-2026",
    label: "food",
    amountSatang: 100_000,
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

export function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-july-card",
    userId: USER_ID,
    name: "Fictional Card",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    outstandingBalanceSatang: 1_000_000,
    statementBalanceSatang: 1_000_000,
    amountDueSatang: 120_000,
    minimumPaymentSatang: 50_000,
    amountPaidThisCycleSatang: 0,
    dueDate: "2026-07-25",
    cycleStartDate: "2026-07-01",
    cycleEndDate: "2026-07-31",
    interestRateAnnual: 18,
    status: "active",
    ...overrides,
  };
}

export function resetMockFinanceState() {
  const globalWithMock = globalThis as typeof globalThis & {
    __tanglakMockState?: {
      users: Map<string, { email: string; password: string; id: string }>;
      transactions: Transaction[];
      debts: Debt[];
      documents: unknown[];
      documentExtractions: unknown[];
      duplicateCandidates: unknown[];
      importBatches: unknown[];
      importRows: unknown[];
      accounts: unknown[];
      monthlyBudgets: MonthlyBudget[];
      budgetCategories: BudgetCategory[];
    };
  };

  if (!globalWithMock.__tanglakMockState) return;
  globalWithMock.__tanglakMockState.users.clear();
  globalWithMock.__tanglakMockState.transactions = [];
  globalWithMock.__tanglakMockState.debts = [];
  globalWithMock.__tanglakMockState.documents = [];
  globalWithMock.__tanglakMockState.documentExtractions = [];
  globalWithMock.__tanglakMockState.duplicateCandidates = [];
  globalWithMock.__tanglakMockState.importBatches = [];
  globalWithMock.__tanglakMockState.importRows = [];
  globalWithMock.__tanglakMockState.accounts = [];
  globalWithMock.__tanglakMockState.monthlyBudgets = [];
  globalWithMock.__tanglakMockState.budgetCategories = [];
}
