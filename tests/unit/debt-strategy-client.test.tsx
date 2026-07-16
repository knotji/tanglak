import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrategyClient } from "@/app/debts/strategy/StrategyClient";
import type { Debt } from "@/types/domain";

const mockUsePathname = vi.fn();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

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

function activeDebt(overrides: Partial<Debt>): Debt {
  return {
    id: overrides.id ?? "debt-1",
    userId: "user-1",
    name: overrides.name ?? "บัตรเครดิต",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    status: "active",
    outstandingBalanceSatang: overrides.outstandingBalanceSatang ?? 10_000_00,
    minimumPaymentSatang: overrides.minimumPaymentSatang ?? 1_000_00,
    amountPaidThisCycleSatang: 0,
    interestRateAnnual: overrides.interestRateAnnual ?? 18,
    dueDate: overrides.dueDate ?? "2026-07-25",
    ...overrides,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("StrategyClient", () => {
  it("renders read-only strategy controls and updates the extra budget preview", () => {
    mockUsePathname.mockReturnValue("/debts/strategy");
    const debts = [
      activeDebt({
        id: "small-card",
        name: "บัตรยอดเล็ก",
        outstandingBalanceSatang: 5_000_00,
        minimumPaymentSatang: 500_00,
        interestRateAnnual: 8,
      }),
      activeDebt({
        id: "high-interest",
        name: "สินเชื่อดอกสูง",
        outstandingBalanceSatang: 20_000_00,
        minimumPaymentSatang: 1_500_00,
        interestRateAnnual: 30,
      }),
    ];

    const { container, root } = render(<StrategyClient debts={debts} />);

    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(2);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");
    expect(radios[1]?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("บัตรยอดเล็ก");
    expect(container.textContent).toContain("สินเชื่อดอกสูง");
    expect(container.querySelector('a[href="/debts"]')).toBeTruthy();

    const input = container.querySelector<HTMLInputElement>("#extra-budget");
    expect(input).toBeTruthy();
    act(() => {
      setInputValue(input!, "2000");
    });
    expect(container.textContent).toContain("2,000");

    act(() => {
      radios[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(radios[0]?.getAttribute("aria-checked")).toBe("false");
    expect(radios[1]?.getAttribute("aria-checked")).toBe("true");

    cleanup(root, container);
  });

  it("shows the insufficient-debt fallback without a write action", () => {
    mockUsePathname.mockReturnValue("/debts/strategy");
    const { container, root } = render(<StrategyClient debts={[activeDebt({ id: "only-debt" })]} />);

    expect(container.textContent).toContain("ยังไม่ปิด");
    expect(container.querySelector('a[href="/debts"]')).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();

    cleanup(root, container);
  });
});
