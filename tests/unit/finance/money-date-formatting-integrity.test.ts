import { describe, expect, it } from "vitest";
import { formatTHB } from "@/lib/finance/money";
import {
  bangkokDateTimeLocalToInstant,
  formatThaiDateTimeLabel,
  getBangkokDateOf,
  getBangkokMonthOf,
  isValidDateKey,
  parseWallClockComponents,
} from "@/lib/finance/date";
import { parseDocumentTimestamp } from "@/lib/ai/timestamp";

function expectNoImpossibleMoney(value: string) {
  expect(value).not.toMatch(/(^|[^\d])-฿0(?!\.)|(^|[^\d])\+฿0(?!\.)|฿-0|NaN|Infinity|∞/);
}

describe("money formatting integrity", () => {
  it.each([
    [1, "฿0.01"],
    [100, "฿1"],
    [123_456_789, "฿1,234,567.89"],
    [-12_345, "-฿123.45"],
    [0, "฿0"],
    [-0, "฿0"],
  ])("formats %s satang safely", (satang, expected) => {
    const formatted = formatTHB(satang);
    expect(formatted).toBe(expected);
    expectNoImpossibleMoney(formatted);
  });

  it("never emits a sign for zero even when a positive sign is requested", () => {
    expect(formatTHB(0, { showPositiveSign: true })).toBe("฿0");
    expect(formatTHB(-0, { showPositiveSign: true })).toBe("฿0");
    expect(formatTHB(1, { showPositiveSign: true })).toBe("+฿0.01");
  });

  it("documents invalid numeric input behavior without leaking NaN or Infinity through valid calls", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => formatTHB(value)).toThrow("Invalid satang amount");
    }
    for (const value of [0, -0, 1, -1, 100_000]) {
      expectNoImpossibleMoney(formatTHB(value));
    }
  });
});

describe("date formatting and parsing integrity", () => {
  it.each([
    ["2026-07-05T13:44:00+07:00", "2026-07-05", "2026-07"],
    ["2026-07-05T06:44:00.000Z", "2026-07-05", "2026-07"],
    ["2026-06-30T17:00:00.000Z", "2026-07-01", "2026-07"],
  ])("renders %s as Bangkok-local date/month", (instant, dateKey, monthKey) => {
    expect(getBangkokDateOf(instant)).toBe(dateKey);
    expect(getBangkokMonthOf(instant)).toBe(monthKey);
  });

  it.each(["", "2026-02-29T10:00", "2026-13-01T10:00", "2026-07-01T24:00"])(
    "rejects invalid datetime-local value %s",
    (value) => {
      expect(parseWallClockComponents(value)).toBeNull();
      expect(formatThaiDateTimeLabel(value)).toBeNull();
      expect(() => bangkokDateTimeLocalToInstant(value)).toThrow("Invalid date");
    },
  );

  it("does not swap month/day or reinterpret BE dates as Gregorian future years", () => {
    expect(isValidDateKey("2026-07-05")).toBe(true);
    expect(parseDocumentTimestamp("05/07/2569 13:44").iso).toBe("2026-07-05T13:44:00+07:00");
    expect(parseDocumentTimestamp("07/05/2026 13:44").state).toBe("invalid");
  });
});
