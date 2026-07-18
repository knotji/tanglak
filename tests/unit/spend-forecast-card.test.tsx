import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpendForecastCard, shouldShowSpendForecast } from "@/components/SpendForecastCard";
import type { SpendForecast } from "@/lib/finance/spend-forecast";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function forecast(overrides: Partial<SpendForecast> = {}): SpendForecast {
  return {
    isAvailable: true,
    trailingWindowDaysUsed: 7,
    trailingSpendSatang: 70_000,
    averageDailySpendSatang: 10_000,
    remainingDaysInMonth: 16,
    projectedAdditionalSpendSatang: 160_000,
    projectedMonthEndSpendSatang: 560_000,
    remainingBudgetSatang: 50_000,
    projectedBudgetVarianceSatang: 60_000,
    onTrackToExceedBudget: true,
    projectedBudgetExhaustionDate: "2026-07-20",
    daysBeforeMonthEnd: 11,
    ...overrides,
  };
}

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

describe("SpendForecastCard", () => {
  it("renders advisory forecast copy, variance, exhaustion timing, and budget CTA", () => {
    const { container, root } = render(<SpendForecastCard forecast={forecast()} month="2026-07" todayKey="2026-07-15" />);

    expect(container.querySelector('[role="status"]')?.textContent).toContain("ระวังงบหมดก่อนสิ้นเดือน");
    expect(container.textContent).toContain("จากการใช้จ่ายช่วง 7 วันที่ผ่านมา");
    expect(container.textContent).toContain("คาดว่าจะใช้เพิ่มอีกประมาณ ฿1,600");
    expect(container.textContent).toContain("คาดว่างบจะหมดประมาณวันที่");
    expect(container.textContent).toContain("เร็วกว่าสิ้นเดือนประมาณ 11 วัน");
    expect(container.textContent).toContain("อาจเกินงบประมาณ ฿600");
    expect(container.textContent).toContain("เป็นการประมาณจากพฤติกรรมล่าสุด ยอดจริงอาจเปลี่ยนได้");
    expect(container.querySelector('a[href="/budget"]')?.textContent).toContain("ดูและปรับงบ");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();

    cleanup(root, container);
  });

  it("renders month-end timing copy when exhaustion lands exactly on the final day", () => {
    const { container, root } = render(
      <SpendForecastCard
        forecast={forecast({ projectedBudgetExhaustionDate: "2026-07-31", daysBeforeMonthEnd: 0 })}
        month="2026-07"
        todayKey="2026-07-15"
      />,
    );

    expect(container.textContent).toContain("พอดีกับสิ้นเดือน");
    cleanup(root, container);
  });

  it("hides when the forecast is not actionable for Today", () => {
    expect(shouldShowSpendForecast(forecast({ onTrackToExceedBudget: false }), "2026-07", "2026-07-15")).toBe(false);
    expect(shouldShowSpendForecast(forecast({ isAvailable: false }), "2026-07", "2026-07-15")).toBe(false);
    expect(shouldShowSpendForecast(forecast(), "2026-07", "2026-08-01")).toBe(false);

    const { container, root } = render(
      <SpendForecastCard forecast={forecast({ onTrackToExceedBudget: false })} month="2026-07" todayKey="2026-07-15" />,
    );
    expect(container.textContent).toBe("");
    cleanup(root, container);
  });
});
