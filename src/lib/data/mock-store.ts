import type { Account, Debt, FinanceDocument, DocumentExtraction, Transaction, ImportBatch, ImportRow } from "@/types/domain";

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
  };
  return globalForMock.__tanglakMockState;
}

export function mockUserId(email: string) {
  return `mock-${Buffer.from(email).toString("base64url").slice(0, 18)}`;
}
