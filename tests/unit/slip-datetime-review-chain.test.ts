import { describe, expect, it } from "vitest";
import { parseDocumentTimestamp } from "@/lib/ai/timestamp";
import { formatThaiDateTimeLabel, bangkokDateTimeLocalToInstant } from "@/lib/finance/date";

/**
 * Issue 4 investigation (production report: a slip's datetime-local input
 * displayed "07/05/2026 01:44" for a printed "05 ก.ค. 2569 - 13:44").
 * Traced the full data path (parseDocumentTimestamp -> document_extractions
 * jsonb storage -> ReviewForm state -> datetime-local value= -> helper
 * text) and found no code defect: the underlying value is
 * "2026-07-05T13:44" end-to-end, byte-identical between the input's value
 * and what the Thai helper text derives from. "07/05/2026 01:44" is the
 * browser's own native <input type="datetime-local"> locale rendering of
 * that CORRECT value (MM/DD/YYYY order, 12-hour clock -- 13:44 - 12:00 =
 * 01:44, with "PM" apparently not transcribed in the report). This test
 * file locks down the full chain end-to-end so a real regression would be
 * caught, without introducing a custom date picker to work around a
 * native-widget rendering quirk that isn't actually a data bug.
 */
describe("slip datetime review chain (Issue 4)", () => {
  const cases: Array<{ label: string; source: string; iso: string; dateTimeLocal: string; thaiLabel: string }> = [
    {
      label: "the exact reported production case",
      source: "05 ก.ค. 2569 - 13:44",
      iso: "2026-07-05T13:44:00+07:00",
      dateTimeLocal: "2026-07-05T13:44",
      thaiLabel: "5 ก.ค. 2026 เวลา 13:44",
    },
    {
      label: "midnight",
      source: "05 ก.ค. 2569 - 00:15",
      iso: "2026-07-05T00:15:00+07:00",
      dateTimeLocal: "2026-07-05T00:15",
      thaiLabel: "5 ก.ค. 2026 เวลา 00:15",
    },
    {
      label: "end of day",
      source: "05 ก.ค. 2569 - 23:59",
      iso: "2026-07-05T23:59:00+07:00",
      dateTimeLocal: "2026-07-05T23:59",
      thaiLabel: "5 ก.ค. 2026 เวลา 23:59",
    },
    {
      label: "ISO-shaped BE timestamp",
      source: "2569-07-05T13:44:00+07:00",
      iso: "2026-07-05T13:44:00+07:00",
      dateTimeLocal: "2026-07-05T13:44",
      thaiLabel: "5 ก.ค. 2026 เวลา 13:44",
    },
    {
      label: "numeric BE date (day unambiguous, > 12)",
      source: "15/07/2569 13:44",
      iso: "2026-07-15T13:44:00+07:00",
      dateTimeLocal: "2026-07-15T13:44",
      thaiLabel: "15 ก.ค. 2026 เวลา 13:44",
    },
  ];

  for (const { label, source, iso, dateTimeLocal, thaiLabel } of cases) {
    it(`${label}: "${source}" -> datetime-local "${dateTimeLocal}", never a day/month swap or 12-hour shift`, () => {
      // 1. Parser output (already regression-tested in timestamp.test.ts;
      //    re-asserted here as the chain's starting point).
      const parsed = parseDocumentTimestamp(source);
      expect(parsed.state).toBe("extracted");
      expect(parsed.iso).toBe(iso);

      // 2. ReviewForm.tsx's datetime-local input value: `iso.slice(0, 16)`.
      //    This must never go through `new Date(...).toISOString()` or any
      //    other UTC/locale-dependent round-trip -- it's a plain string
      //    slice of an already-correct, offset-preserving ISO string.
      const inputValue = parsed.iso!.slice(0, 16);
      expect(inputValue).toBe(dateTimeLocal);
      expect(inputValue).not.toContain("Z");

      // 3. The Thai helper text shown next to the input must describe the
      //    exact same wall-clock date/time -- no drift between what the
      //    input's value= holds and what the human-readable label says.
      expect(formatThaiDateTimeLabel(inputValue)).toBe(thaiLabel);

      // 4. Saving without further edits (the exact datetime-local value
      //    round-tripped through the save action) must reproduce the
      //    original Bangkok-offset instant exactly -- no shift, no
      //    fabricated fallback.
      expect(bangkokDateTimeLocalToInstant(inputValue)).toBe(iso);
    });
  }

  it("day and month are never transposed for a two-digit day > 12 (regression for the reported 'day/month swap')", () => {
    // Day 05 must never become month 05 in the output -- July (07) must
    // stay in the month position and 05 in the day position throughout.
    const parsed = parseDocumentTimestamp("05 ก.ค. 2569 - 13:44");
    expect(parsed.iso).toMatch(/^2026-07-05T/); // YYYY-MM-DD: month=07, day=05
    expect(parsed.iso).not.toMatch(/^2026-05-07T/);
  });

  it("13:44 is never reduced to 01:44 anywhere in the stored/derived string chain (only a 12-hour clock DISPLAY would show that, never the data)", () => {
    const parsed = parseDocumentTimestamp("05 ก.ค. 2569 - 13:44");
    const inputValue = parsed.iso!.slice(0, 16);
    expect(inputValue).toContain("T13:44");
    expect(inputValue).not.toContain("01:44");
    expect(formatThaiDateTimeLabel(inputValue)).toContain("13:44");
  });
});
