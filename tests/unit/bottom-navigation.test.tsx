import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "@/components/BottomNavigation";

const mockUsePathname = vi.fn();

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

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("BottomNavigation", () => {
  it("includes a Budget destination pointing at /budget with the Thai label 'งบ'", () => {
    mockUsePathname.mockReturnValue("/today");
    const { container, root } = render(<BottomNavigation />);
    const link = container.querySelector('a[href="/budget"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("งบ");
    cleanup(root, container);
  });

  it("covers the five primary destinations without overcrowding (exactly 5 items)", () => {
    mockUsePathname.mockReturnValue("/today");
    const { container, root } = render(<BottomNavigation />);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(5);
    const hrefs = Array.from(links).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/today", "/transactions", "/budget", "/debts", "/overview"]);
    cleanup(root, container);
  });

  it("marks the active route with aria-current, without relying on color alone", () => {
    mockUsePathname.mockReturnValue("/budget");
    const { container, root } = render(<BottomNavigation />);
    const activeLink = container.querySelector('a[href="/budget"]');
    const inactiveLink = container.querySelector('a[href="/today"]');

    expect(activeLink?.getAttribute("aria-current")).toBe("page");
    expect(inactiveLink?.getAttribute("aria-current")).toBeNull();

    // Non-color cues: bold label text and a filled indicator dot distinguish
    // the active item, not just a background/text color change.
    expect(activeLink?.className).toContain("font-bold");
    expect(inactiveLink?.className).toContain("font-medium");
    expect(activeLink?.querySelector("svg")?.getAttribute("stroke-width")).toBe("2.5");
    expect(inactiveLink?.querySelector("svg")?.getAttribute("stroke-width")).toBe("2");
    cleanup(root, container);
  });

  it("gives every link a minimum 44px touch target via min-h-11 sizing", () => {
    mockUsePathname.mockReturnValue("/today");
    const { container, root } = render(<BottomNavigation />);
    container.querySelectorAll("a").forEach((link) => {
      expect(link.className).toContain("min-h-11");
    });
    cleanup(root, container);
  });

  it("exposes an accessible landmark label for the navigation region", () => {
    mockUsePathname.mockReturnValue("/today");
    const { container, root } = render(<BottomNavigation />);
    expect(container.querySelector('nav[aria-label="เมนูหลัก"]')).toBeTruthy();
    cleanup(root, container);
  });

  it("highlights parent route on nested paths (e.g. /debts/[debtId])", () => {
    mockUsePathname.mockReturnValue("/debts/abc");
    const { container, root } = render(<BottomNavigation />);
    const activeLink = container.querySelector('a[href="/debts"]');
    const inactiveLink = container.querySelector('a[href="/today"]');

    expect(activeLink?.getAttribute("aria-current")).toBe("page");
    expect(inactiveLink?.getAttribute("aria-current")).toBeNull();
    cleanup(root, container);
  });

  it("does not highlight parent route on prefix collision paths (e.g. /debt-tools)", () => {
    mockUsePathname.mockReturnValue("/debt-tools");
    const { container, root } = render(<BottomNavigation />);
    const link = container.querySelector('a[href="/debts"]');

    expect(link?.getAttribute("aria-current")).toBeNull();
    cleanup(root, container);
  });
});
