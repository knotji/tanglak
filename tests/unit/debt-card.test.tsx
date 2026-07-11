import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DebtCard } from "@/components/DebtCard";
import type { Debt } from "@/types/domain";

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

afterEach(() => {
  document.body.innerHTML = "";
});

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-a",
    name: "บัตรเครดิต A",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    outstandingBalanceSatang: 10_000_00,
    minimumPaymentSatang: 1_000_00,
    amountPaidThisCycleSatang: 0,
    status: "active",
    ...overrides,
  };
}

const TODAY = new Date(Date.UTC(2026, 6, 15));

describe("DebtCard", () => {
  it("does not fabricate a fake masked card number", () => {
    const { container, root } = render(<DebtCard debt={debt()} today={TODAY} />);
    expect(container.textContent).not.toContain("4821");
    cleanup(root, container);
  });

  it("labels an overdue debt with text, not color alone", () => {
    const overdue = debt({ dueDate: "2026-07-01" });
    const { container, root } = render(<DebtCard debt={overdue} today={TODAY} />);
    expect(container.textContent).toContain("เลยกำหนด");
    cleanup(root, container);
  });

  it("labels a not-yet-due debt with a day count instead of the overdue word", () => {
    const dueSoon = debt({ dueDate: "2026-07-20" });
    const { container, root } = render(<DebtCard debt={dueSoon} today={TODAY} />);
    expect(container.textContent).toContain("อีก");
    expect(container.textContent).not.toContain("เลยกำหนด");
    cleanup(root, container);
  });

  it("links 'ดูรายละเอียด' to the debt's own detail route", () => {
    const { container, root } = render(<DebtCard debt={debt({ id: "debt-42" })} today={TODAY} />);
    const link = container.querySelector('a[href="/debts/debt-42"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("ดูรายละเอียด");
    cleanup(root, container);
  });
});
