import { describe, expect, it } from "vitest";
import {
  bangkokDateTimeLocalToInstant,
  formatThaiDateTimeLabel,
  isLikelyInferredNoonTimestamp,
  parseWallClockComponents,
  formatThaiDateCompact,
  formatThaiDateFull,
  formatThaiDateTime,
} from "@/lib/finance/date";

describe("formatThaiDateCompact", () => {
  it("formats a date to compact Thai string", () => {
    const date = new Date("2026-07-14T11:51:00+07:00");
    expect(formatThaiDateCompact(date)).toBe("14 ก.ค.");
  });

  it("handles ISO strings", () => {
    expect(formatThaiDateCompact("2026-07-14T11:51:00+07:00")).toBe("14 ก.ค.");
  });
});

describe("formatThaiDateFull", () => {
  it("formats a date to full Thai string", () => {
    const date = new Date("2026-07-14T11:51:00+07:00");
    expect(formatThaiDateFull(date)).toBe("14 ก.ค. 2026");
  });
});

describe("formatThaiDateTime", () => {
  it("formats a date to Thai date and time string", () => {
    const date = new Date("2026-07-14T11:51:00+07:00");
    expect(formatThaiDateTime(date)).toBe("14 ก.ค. 2026 เวลา 11:51");
  });

  it("ensures 24-hour cycle is used", () => {
    const date = new Date("2026-07-14T23:51:00+07:00");
    expect(formatThaiDateTime(date)).toBe("14 ก.ค. 2026 เวลา 23:51");
  });
});

describe("parseWallClockComponents", () => {
  it("parses a well-formed datetime-local value", () => {
    expect(parseWallClockComponents("2026-07-11T07:26")).toEqual({
      year: 2026,
      month: 7,
      day: 11,
      hour: 7,
      minute: 26,
    });
  });

  it("rejects an empty string", () => {
    expect(parseWallClockComponents("")).toBeNull();
  });

  it("rejects a malformed string", () => {
    expect(parseWallClockComponents("not-a-date")).toBeNull();
    expect(parseWallClockComponents("2026-07-11")).toBeNull();
  });

  it("rejects an out-of-range calendar date (e.g. day 32)", () => {
    expect(parseWallClockComponents("2026-07-32T07:26")).toBeNull();
  });

  it("rejects an out-of-range time (e.g. hour 25)", () => {
    expect(parseWallClockComponents("2026-07-11T25:00")).toBeNull();
  });
});

describe("formatThaiDateTimeLabel", () => {
  it('formats 2026-07-11T07:26 as "11 ก.ค. 2026 เวลา 07:26"', () => {
    expect(formatThaiDateTimeLabel("2026-07-11T07:26")).toBe("11 ก.ค. 2026 เวลา 07:26");
  });

  it("does not shift the date/time regardless of the runner's own timezone", () => {
    // The value is treated as literal wall-clock digits, never re-interpreted
    // through a timezone-aware Date parse, so this must hold no matter what
    // TZ the test process happens to run under.
    expect(formatThaiDateTimeLabel("2026-01-01T00:05")).toBe("1 ม.ค. 2026 เวลา 00:05");
    expect(formatThaiDateTimeLabel("2026-12-31T23:55")).toBe("31 ธ.ค. 2026 เวลา 23:55");
  });

  it("returns null for an invalid value instead of throwing", () => {
    expect(formatThaiDateTimeLabel("garbage")).toBeNull();
    expect(formatThaiDateTimeLabel("")).toBeNull();
  });
});

describe("bangkokDateTimeLocalToInstant", () => {
  it("converts a datetime-local value to a fixed +07:00 instant using the exact entered digits", () => {
    expect(bangkokDateTimeLocalToInstant("2026-07-11T07:26")).toBe("2026-07-11T07:26:00+07:00");
  });

  it("never shifts the date/time regardless of the runner's own timezone", () => {
    // No Date() round-trip happens -- the same literal digits go in and
    // come out, only with a fixed +07:00 suffix appended.
    expect(bangkokDateTimeLocalToInstant("2026-01-01T00:05")).toBe("2026-01-01T00:05:00+07:00");
    expect(bangkokDateTimeLocalToInstant("2026-12-31T23:55")).toBe("2026-12-31T23:55:00+07:00");
  });

  it("pads single-digit month/day/hour/minute correctly", () => {
    expect(bangkokDateTimeLocalToInstant("2026-01-05T09:05")).toBe("2026-01-05T09:05:00+07:00");
  });

  it("throws for an invalid value instead of fabricating a fallback instant", () => {
    expect(() => bangkokDateTimeLocalToInstant("garbage")).toThrow();
    expect(() => bangkokDateTimeLocalToInstant("")).toThrow();
    expect(() => bangkokDateTimeLocalToInstant("2026-07-32T07:26")).toThrow();
  });
});

describe("isLikelyInferredNoonTimestamp", () => {
  it("recognizes the noon placeholder emitted for date-only source timestamps", () => {
    expect(isLikelyInferredNoonTimestamp("2026-07-11T12:00:00+07:00")).toBe(true);
  });

  it("does not flag a genuinely extracted 12:xx timestamp with non-zero seconds/minutes", () => {
    expect(isLikelyInferredNoonTimestamp("2026-07-10T12:30:00+07:00")).toBe(false);
  });

  it("does not flag an ordinary non-noon timestamp", () => {
    expect(isLikelyInferredNoonTimestamp("2026-07-11T07:26:00+07:00")).toBe(false);
  });

  it("returns false for an absent value", () => {
    expect(isLikelyInferredNoonTimestamp(undefined)).toBe(false);
  });
});
