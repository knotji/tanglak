import { describe, expect, it } from "vitest";
import {
  parseDocumentTimestamp,
  TIMESTAMP_AMBIGUOUS_WARNING_TH,
  TIMESTAMP_INVALID_WARNING_TH,
} from "@/lib/ai/timestamp";

describe("parseDocumentTimestamp", () => {
  it('parses "11 Jul 26 07:26 +0700" as extracted, preserving the explicit offset', () => {
    const result = parseDocumentTimestamp("11 Jul 26 07:26 +0700");
    expect(result.state).toBe("extracted");
    expect(result.iso).toBe("2026-07-11T07:26:00+07:00");
  });

  it('parses "11 Jul 2026" (no time) as inferred with a noon placeholder', () => {
    const result = parseDocumentTimestamp("11 Jul 2026");
    expect(result.state).toBe("inferred");
    expect(result.iso).toBe("2026-07-11T12:00:00+07:00");
  });

  it('parses "11 July 2026" (full month name, no time) as inferred', () => {
    const result = parseDocumentTimestamp("11 July 2026");
    expect(result.state).toBe("inferred");
    expect(result.iso).toBe("2026-07-11T12:00:00+07:00");
  });

  it("accepts both +0700 and +07:00 offset spellings identically", () => {
    const compact = parseDocumentTimestamp("11 Jul 26 07:26 +0700");
    const colon = parseDocumentTimestamp("11 Jul 26 07:26 +07:00");
    expect(compact.iso).toBe("2026-07-11T07:26:00+07:00");
    expect(colon.iso).toBe("2026-07-11T07:26:00+07:00");
    expect(compact.iso).toBe(colon.iso);
  });

  it("does not apply a second UTC-to-Bangkok conversion when an offset is already present", () => {
    // If the code re-converted this (e.g. treating it as UTC and adding +7
    // again), the hour would drift away from 07:26. It must not.
    const result = parseDocumentTimestamp("11 Jul 26 07:26 +0700");
    expect(result.iso).toMatch(/T07:26:00\+07:00$/);
  });

  it("preserves a non-Bangkok explicit offset verbatim instead of forcing +07:00", () => {
    const result = parseDocumentTimestamp("11 Jul 26 07:26 +0900");
    expect(result.state).toBe("extracted");
    expect(result.iso).toBe("2026-07-11T07:26:00+09:00");
  });

  it("never interprets 'DD MMM YY' as MM/DD/YYYY (day always leads)", () => {
    // "11 Jul 26" must always resolve to day=11, month=7 — never day=7,
    // month=11 (which would be the case under a US-style MM/DD misread).
    const result = parseDocumentTimestamp("11 Jul 26 07:26 +0700");
    expect(result.iso?.slice(0, 10)).toBe("2026-07-11");
  });

  it("rejects a fully ambiguous numeric date like 07/11/2026 rather than guessing", () => {
    const result = parseDocumentTimestamp("07/11/2026");
    expect(result.state).toBe("invalid");
    expect(result.warning).toBe(TIMESTAMP_AMBIGUOUS_WARNING_TH);
    expect(result.iso).toBeUndefined();
  });

  it("resolves an unambiguous numeric date when one component exceeds 12", () => {
    // 13 cannot be a month, so this is deterministically day=13, month=7.
    // No time component is present, so the time is (safely) inferred.
    const result = parseDocumentTimestamp("13/07/2026");
    expect(result.state).toBe("inferred");
    expect(result.iso?.slice(0, 10)).toBe("2026-07-13");
  });

  it("resolves an unambiguous numeric date with a time component as fully extracted", () => {
    const result = parseDocumentTimestamp("13/07/2026 07:26 +0700");
    expect(result.state).toBe("extracted");
    expect(result.iso).toBe("2026-07-13T07:26:00+07:00");
  });

  it("does not substitute the current date/time for a malformed time value", () => {
    const before = Date.now();
    const result = parseDocumentTimestamp("11 Jul 26 25:99 +0700");
    const after = Date.now();
    expect(result.state).toBe("invalid");
    expect(result.warning).toBe(TIMESTAMP_INVALID_WARNING_TH);
    expect(result.iso).toBeUndefined();
    // Sanity: nothing in the result should be derived from "now".
    expect(result.iso === undefined || (Date.parse(result.iso) < before || Date.parse(result.iso) > after)).toBe(
      true,
    );
  });

  it("does not substitute the current date/time for unparseable garbage text", () => {
    const result = parseDocumentTimestamp("not a real date at all");
    expect(result.state).toBe("invalid");
    expect(result.warning).toBe(TIMESTAMP_INVALID_WARNING_TH);
    expect(result.iso).toBeUndefined();
  });

  it("marks an entirely absent timestamp as missing, not invalid, and never invents one", () => {
    expect(parseDocumentTimestamp(undefined)).toEqual({ state: "missing" });
    expect(parseDocumentTimestamp(null)).toEqual({ state: "missing" });
    expect(parseDocumentTimestamp("")).toEqual({ state: "missing" });
    expect(parseDocumentTimestamp("   ")).toEqual({ state: "missing" });
  });

  it("distinguishes missing from invalid from inferred from extracted", () => {
    expect(parseDocumentTimestamp(undefined).state).toBe("missing");
    expect(parseDocumentTimestamp("garbage").state).toBe("invalid");
    expect(parseDocumentTimestamp("11 Jul 2026").state).toBe("inferred");
    expect(parseDocumentTimestamp("11 Jul 26 07:26 +0700").state).toBe("extracted");
  });

  it("trusts an already-clean ISO string with an explicit offset unchanged", () => {
    const result = parseDocumentTimestamp("2026-07-11T07:26:00+07:00");
    expect(result.state).toBe("extracted");
    expect(result.iso).toBe("2026-07-11T07:26:00+07:00");
  });

  it("adds the default Bangkok offset to a bare ISO date-time with no offset", () => {
    const result = parseDocumentTimestamp("2026-07-11T07:26:00");
    expect(result.state).toBe("extracted");
    expect(result.iso).toBe("2026-07-11T07:26:00+07:00");
  });

  it("infers noon for a bare ISO date with no time component", () => {
    const result = parseDocumentTimestamp("2026-07-11");
    expect(result.state).toBe("inferred");
    expect(result.iso).toBe("2026-07-11T12:00:00+07:00");
  });

  it("rejects a calendar-invalid date (e.g. day 32) instead of inventing one", () => {
    const result = parseDocumentTimestamp("32 Jul 2026");
    expect(result.state).toBe("invalid");
    expect(result.iso).toBeUndefined();
  });

  it("rejects an unknown month name instead of guessing", () => {
    const result = parseDocumentTimestamp("11 Xyz 2026");
    expect(result.state).toBe("invalid");
    expect(result.iso).toBeUndefined();
  });

  it("rejects a non-string candidate instead of inventing a time", () => {
    const result = parseDocumentTimestamp(12345 as unknown);
    expect(result.state).toBe("invalid");
    expect(result.iso).toBeUndefined();
  });

  describe("Thai Buddhist-era date parsing & BE-to-AD year resolution", () => {
    it("parses SCB bank slip date string with abbreviated Thai month and 4-digit BE year", () => {
      const result = parseDocumentTimestamp("05 ก.ค. 2569 - 13:44");
      expect(result.state).toBe("extracted");
      expect(result.iso).toBe("2026-07-05T13:44:00+07:00");
    });

    it("parses Thai date with full Thai month name and 4-digit BE year", () => {
      const result = parseDocumentTimestamp("05 กรกฎาคม 2569 - 13:44");
      expect(result.state).toBe("extracted");
      expect(result.iso).toBe("2026-07-05T13:44:00+07:00");
    });

    it("parses Thai date with abbreviated Thai month and 2-digit BE year (> 40)", () => {
      const result = parseDocumentTimestamp("05 ก.ค. 69 - 13:44");
      expect(result.state).toBe("extracted");
      expect(result.iso).toBe("2026-07-05T13:44:00+07:00");
    });

    it("parses English date with abbreviated month and 2-digit AD year (<= 40)", () => {
      const result = parseDocumentTimestamp("05 Jul 26 - 13:44");
      expect(result.state).toBe("extracted");
      expect(result.iso).toBe("2026-07-05T13:44:00+07:00");
    });

    it("parses English date with 4-digit AD year", () => {
      const result = parseDocumentTimestamp("05 Jul 2026 - 13:44");
      expect(result.state).toBe("extracted");
      expect(result.iso).toBe("2026-07-05T13:44:00+07:00");
    });

    it("parses unambiguous numeric date with BE year", () => {
      const result = parseDocumentTimestamp("15/07/2569 13:44");
      expect(result.state).toBe("extracted");
      expect(result.iso).toBe("2026-07-15T13:44:00+07:00");
    });

    it("parses Thai date with 'เวลา' separator", () => {
      const result = parseDocumentTimestamp("05 ก.ค. 2569 เวลา 13:44");
      expect(result.state).toBe("extracted");
      expect(result.iso).toBe("2026-07-05T13:44:00+07:00");
    });

    it("parses English date with trailing dot on month name", () => {
      const result = parseDocumentTimestamp("11 Jul. 2026");
      expect(result.state).toBe("inferred");
      expect(result.iso).toBe("2026-07-11T12:00:00+07:00");
    });
  });
});
