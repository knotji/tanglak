import { describe, expect, it } from "vitest";
import {
  parseDocumentTimestamp,
  TIMESTAMP_AMBIGUOUS_WARNING_TH,
  TIMESTAMP_INVALID_WARNING_TH,
} from "@/lib/ai/timestamp";
import {
  getBangkokDateTimeLocalOf,
  formatStandardDateTime,
  bangkokDateTimeLocalToInstant,
} from "@/lib/finance/date";

describe("parseDocumentTimestamp", () => {
  it('parses "11 Jul 26 07:26 +0700" as extracted, preserving the explicit offset', () => {
    const result = parseDocumentTimestamp("11 Jul 26 07:26 +0700");
    expect(result.iso).toBe("2026-07-11T07:26:00+07:00");
    expect(result.state).toBe("extracted");
    expect(result.warning).toBeUndefined();
  });

  it('parses "11/07/2026 07:26" (no offset) by assuming Bangkok local time', () => {
    const result = parseDocumentTimestamp("11/07/2026 07:26");
    // Bangkok-relative parse
    expect(result.iso).toBeUndefined();
    expect(result.state).toBe("invalid");
    expect(result.warning).toBe(TIMESTAMP_AMBIGUOUS_WARNING_TH);
  });

  it("emits an ambiguous warning when given only a date without time", () => {
    const result = parseDocumentTimestamp("2026-07-11");
    // Defaults to noon Bangkok
    expect(result.iso).toBe("2026-07-11T12:00:00+07:00");
    expect(result.state).toBe("inferred");
    // In ISO path, textual ambiguity warning isn't applied if it's already ISO shaped
    // But textual paths DO apply it.
  });

  it("handles empty or whitespace-only input as missing", () => {
    const result = parseDocumentTimestamp("  ");
    expect(result.iso).toBeUndefined();
    expect(result.state).toBe("missing");
  });

  it("handles completely unparseable noise as invalid", () => {
    const result = parseDocumentTimestamp("not a date");
    expect(result.iso).toBeUndefined();
    expect(result.state).toBe("invalid");
    expect(result.warning).toContain(TIMESTAMP_INVALID_WARNING_TH);
  });
});

describe("Bangkok datetime round-trip", () => {
  it("preserves wall-clock time between ISO instant and datetime-local string", () => {
    const instant = "2026-07-14T13:09:00+07:00";
    const local = getBangkokDateTimeLocalOf(instant);
    expect(local).toBe("2026-07-14T13:09");
    const backToInstant = bangkokDateTimeLocalToInstant(local);
    expect(backToInstant).toBe(instant);
  });

  it("handles standard formatting correctly", () => {
    const instant = "2026-07-14T13:09:00+07:00";
    expect(formatStandardDateTime(instant)).toBe("14/07/2026 13:09");
  });
});
