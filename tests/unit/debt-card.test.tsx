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
    expect(container.textContent).toContain("เกินกำหนด");
    cleanup(root, container);
  });

  it("labels a debt due well in the future as not yet due", () => {
    const notYetDue = debt({ dueDate: "2026-07-25" }); // 10 days out
    const { container, root } = render(<DebtCard debt={notYetDue} today={TODAY} />);
    expect(container.textContent).toContain("ยังไม่ถึงกำหนด");
    expect(container.textContent).not.toContain("เกินกำหนด");
    cleanup(root, container);
  });

  it("labels a debt due within 3 days as due soon", () => {
    const dueSoon = debt({ dueDate: "2026-07-17" }); // 2 days out
    const { container, root } = render(<DebtCard debt={dueSoon} today={TODAY} />);
    expect(container.textContent).toContain("ใกล้ครบกำหนด");
    cleanup(root, container);
  });

  it("shows minimum-paid status once paidThisCycle meets the minimum, even past the due date window", () => {
    const paid = debt({ dueDate: "2026-07-25", minimumPaymentSatang: 1_000_00, amountPaidThisCycleSatang: 1_000_00 });
    const { container, root } = render(<DebtCard debt={paid} today={TODAY} />);
    expect(container.textContent).toContain("จ่ายขั้นต่ำแล้ว");
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
