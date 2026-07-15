import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ManualTransactionForm } from "@/features/transactions/ManualTransactionForm";
import type { Transaction } from "@/types/domain";

const transaction: Transaction = {
  id: "t1",
  userId: "u1",
  type: "expense",
  status: "confirmed",
  amountSatang: 10000,
  currency: "THB",
  occurredAt: "2026-07-15T09:46:00+07:00",
  merchant: "GrabFood",
  category: "อาหาร",
  source: "manual",
};

describe("ManualTransactionForm edit mode", () => {
  it("renders an editable input for the transaction name, not a static div", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<ManualTransactionForm transaction={transaction} />);
    });
    const input = container.querySelector('input[name="label"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.disabled).toBe(false);
    expect(input!.value).toBe("GrabFood");
    act(() => root.unmount());
    container.remove();
  });
});
