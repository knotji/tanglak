import { describe, expect, it } from "vitest";
import { isRouteActive } from "@/lib/navigation/routes";

describe("isRouteActive helper", () => {
  describe("Exact matching", () => {
    it("matches identical paths exactly", () => {
      expect(isRouteActive("/", "/")).toBe(true);
      expect(isRouteActive("/today", "/today")).toBe(true);
      expect(isRouteActive("/debts", "/debts")).toBe(true);
    });
  });

  describe("Nested matching", () => {
    it("matches sub-routes under the parent path", () => {
      expect(isRouteActive("/debts/abc", "/debts")).toBe(true);
      expect(isRouteActive("/debts/abc/simulate", "/debts")).toBe(true);
      expect(isRouteActive("/transactions/123", "/transactions")).toBe(true);
    });
  });

  describe("Root safety", () => {
    it("does not match non-root paths to root link", () => {
      expect(isRouteActive("/today", "/")).toBe(false);
      expect(isRouteActive("/debts", "/")).toBe(false);
      expect(isRouteActive("/anything", "/")).toBe(false);
    });
  });

  describe("Collision safety", () => {
    it("does not match paths that have similar prefixes but different boundaries", () => {
      expect(isRouteActive("/debt-tools", "/debts")).toBe(false);
      expect(isRouteActive("/debts-old", "/debts")).toBe(false);
      expect(isRouteActive("/budgeting", "/budget")).toBe(false);
      expect(isRouteActive("/transactions-archive", "/transactions")).toBe(false);
    });
  });

  describe("Query parameters and hash safety", () => {
    it("ignores query strings and hashes when matching active status", () => {
      expect(isRouteActive("/budget?month=2026-05", "/budget")).toBe(true);
      expect(isRouteActive("/debts#hash", "/debts")).toBe(true);
      expect(isRouteActive("/debts/abc?key=val#hash", "/debts")).toBe(true);
    });
  });

  describe("Trailing slashes safety", () => {
    it("ignores trailing slashes on pathname or href appropriately", () => {
      expect(isRouteActive("/debts/", "/debts")).toBe(true);
      expect(isRouteActive("/debts", "/debts/")).toBe(true);
      expect(isRouteActive("/debts/", "/debts/")).toBe(true);
    });
  });
});
