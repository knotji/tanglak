import { describe, expect, it } from "vitest";
import {
  FinancialValueError,
  MONEY_ERROR_INVALID_TH,
  MONEY_ERROR_NEGATIVE_TH,
  MONEY_ERROR_POSITIVE_TH,
  assertMoneySatang,
  parseOptionalMoney,
  parseRequiredMoney,
} from "@/lib/finance/money-guards";

describe("parseRequiredMoney — nonnegative severity (e.g. amountDue, minimumPayment)", () => {
  it("rejects a negative amountDue with the safe Thai copy, not a coerced value", () => {
    const result = parseRequiredMoney("-500", "nonnegative");
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toBe(MONEY_ERROR_NEGATIVE_TH);
    // Never silently repaired: no satang value is returned at all.
    expect(result.ok ? (result as { satang?: number }).satang : undefined).toBeUndefined();
  });

  it("rejects a negative minimumPayment", () => {
    const result = parseRequiredMoney("-1", "nonnegative");
    expect(result.ok).toBe(false);
  });

  it("accepts zero", () => {
    const result = parseRequiredMoney("0", "nonnegative");
    expect(result).toEqual({ ok: true, satang: 0 });
  });

  it("accepts a positive decimal amount", () => {
    const result = parseRequiredMoney("189.50", "nonnegative");
    expect(result).toEqual({ ok: true, satang: 18_950 });
  });

  it("continues to support Thai comma-formatted amounts", () => {
    const result = parseRequiredMoney("1,234.50", "nonnegative");
    expect(result).toEqual({ ok: true, satang: 123_450 });
  });

  it("rejects NaN", () => {
    expect(parseRequiredMoney(Number.NaN, "nonnegative").ok).toBe(false);
    expect(parseRequiredMoney("NaN", "nonnegative").ok).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(parseRequiredMoney(Number.POSITIVE_INFINITY, "nonnegative").ok).toBe(false);
    expect(parseRequiredMoney("Infinity", "nonnegative").ok).toBe(false);
  });

  it("rejects malformed numeric strings", () => {
    expect(parseRequiredMoney("abc", "nonnegative").ok).toBe(false);
    expect(parseRequiredMoney("12.345", "nonnegative").ok).toBe(false);
    expect(parseRequiredMoney("1e10", "nonnegative").ok).toBe(false);
    expect(parseRequiredMoney("--100", "nonnegative").ok).toBe(false);
  });

  it("rejects a blank required value with the invalid-format copy", () => {
    const result = parseRequiredMoney("", "nonnegative");
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toBe(MONEY_ERROR_INVALID_TH);
  });
});

describe("parseRequiredMoney — positive severity (e.g. debt payment amount)", () => {
  it("rejects a negative payment amount", () => {
    const result = parseRequiredMoney("-100", "positive");
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toBe(MONEY_ERROR_POSITIVE_TH);
  });

  it("rejects zero for a strictly-positive field", () => {
    const result = parseRequiredMoney("0", "positive");
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toBe(MONEY_ERROR_POSITIVE_TH);
  });

  it("accepts a positive amount", () => {
    expect(parseRequiredMoney("1500", "positive")).toEqual({ ok: true, satang: 150_000 });
  });
});

describe("parseOptionalMoney", () => {
  it("keeps a blank optional field as undefined instead of an error", () => {
    expect(parseOptionalMoney("", "nonnegative")).toEqual({ ok: true, satang: undefined });
    expect(parseOptionalMoney(undefined, "nonnegative")).toEqual({ ok: true, satang: undefined });
    expect(parseOptionalMoney(null, "nonnegative")).toEqual({ ok: true, satang: undefined });
  });

  it("still rejects a negative value when one is actually provided", () => {
    expect(parseOptionalMoney("-50", "nonnegative").ok).toBe(false);
  });
});

describe("no auto-repair behavior", () => {
  it("never clamps a negative value to zero", () => {
    const result = parseRequiredMoney("-1234.50", "nonnegative");
    expect(result.ok).toBe(false);
    // The function must not return { ok: true, satang: 0 } for this input.
    expect(result).not.toEqual({ ok: true, satang: 0 });
  });

  it("never returns the absolute value of a rejected negative amount", () => {
    const result = parseRequiredMoney("-1234.50", "nonnegative");
    expect(result.ok).toBe(false);
    // Must not silently flip the sign to 123450 either.
    expect(result).not.toEqual({ ok: true, satang: 123_450 });
  });
});

describe("assertMoneySatang", () => {
  it("throws FinancialValueError with safe Thai copy for a negative nonnegative-severity value", () => {
    expect(() => assertMoneySatang(-100, "nonnegative", "amountDueSatang")).toThrow(FinancialValueError);
    try {
      assertMoneySatang(-100, "nonnegative", "amountDueSatang");
    } catch (error) {
      expect(error).toBeInstanceOf(FinancialValueError);
      expect((error as FinancialValueError).message).toBe(MONEY_ERROR_NEGATIVE_TH);
      expect((error as FinancialValueError).field).toBe("amountDueSatang");
    }
  });

  it("throws for a zero positive-severity value (e.g. a debt payment)", () => {
    expect(() => assertMoneySatang(0, "positive", "amountSatang")).toThrow(FinancialValueError);
  });

  it("throws for NaN/Infinity even though they are technically not negative", () => {
    expect(() => assertMoneySatang(Number.NaN, "nonnegative", "amountSatang")).toThrow(FinancialValueError);
    expect(() => assertMoneySatang(Number.POSITIVE_INFINITY, "nonnegative", "amountSatang")).toThrow(
      FinancialValueError,
    );
  });

  it("treats null/undefined as 'not provided' and does not throw (nullable optional field stays valid)", () => {
    expect(() => assertMoneySatang(null, "nonnegative", "statementBalanceSatang")).not.toThrow();
    expect(() => assertMoneySatang(undefined, "nonnegative", "statementBalanceSatang")).not.toThrow();
  });

  it("does not throw for a valid positive amount", () => {
    expect(() => assertMoneySatang(150_000, "positive", "amountSatang")).not.toThrow();
  });
});
