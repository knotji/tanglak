import type { Account, Debt, FinanceDocument, DocumentExtraction, Transaction, ImportBatch, ImportRow, MonthlyBudget, BudgetCategory } from "@/types/domain";
import { createHash } from "node:crypto";

type MockState = {
  users: Map<string, { email: string; password: string; id: string }>;
  transactions: Transaction[];
  debts: Debt[];
  documents: FinanceDocument[];
  documentExtractions: DocumentExtraction[];
  duplicateCandidates: unknown[];
  importBatches: ImportBatch[];
  importRows: ImportRow[];
  accounts: Account[];
  monthlyBudgets: MonthlyBudget[];
  budgetCategories: BudgetCategory[];
};

const globalForMock = globalThis as typeof globalThis & {
  __tanglakMockState?: MockState;
};

export function getMockState(): MockState {
  globalForMock.__tanglakMockState ??= {
    users: new Map(),
    transactions: [],
    debts: [],
    documents: [],
    documentExtractions: [],
    duplicateCandidates: [],
    importBatches: [],
    importRows: [],
    accounts: [],
    monthlyBudgets: [],
    budgetCategories: [],
  };
  return globalForMock.__tanglakMockState;
}

export function mockUserId(email: string) {
  const digest = createHash("sha256").update(email).digest("base64url").slice(0, 24);
  return `mock-${digest}`;
}
