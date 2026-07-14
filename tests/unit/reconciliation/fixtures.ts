import type { Debt, Transaction } from "@/types/domain";

export const USER_ID = "reconciliation-user";
export const OTHER_USER_ID = "reconciliation-other-user";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function resetReconciliationFixtureIds() {
  counter = 0;
}

export function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? nextId("tx"),
    userId: USER_ID,
    type: "expense",
    status: "confirmed",
    amountSatang: 50_000,
    currency: "THB",
    occurredAt: "2026-07-10T12:00:00+07:00",
    source: "manual",
    ...overrides,
  };
}

export function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: overrides.id ?? nextId("debt"),
    userId: USER_ID,
    name: "Fictional Card",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    outstandingBalanceSatang: 1_000_000,
    minimumPaymentSatang: 50_000,
    amountDueSatang: 120_000,
    amountPaidThisCycleSatang: 0,
    dueDate: "2026-07-25",
    status: "active",
    ...overrides,
  };
}
