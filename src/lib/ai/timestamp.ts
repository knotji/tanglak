/**
 * Deterministic, code-side parsing of document transaction timestamps.
 *
 * Gemini is asked to report the date/time as printed on the source
 * document; this module — not the model — does the actual date/timezone
 * arithmetic, since LLM-performed date math is exactly what produced the
 * original bug (a printed "11 Jul 26 07:26 +0700" coming back as a wrong,
 * hallucinated ISO timestamp). Every branch either resolves a value it is
 * confident in or reports why it could not, never a current-time guess.
 */

export type TimestampSourceState = "extracted" | "inferred" | "missing" | "invalid";

export interface TimestampParseResult {
  state: TimestampSourceState;
  iso?: string;
  warning?: string;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  // Thai abbreviated months (with trailing dot)
  "ม.ค.": 1,
  "ก.พ.": 2,
  "มี.ค.": 3,
  "เม.ย.": 4,
  "พ.ค.": 5,
  "มิ.ย.": 6,
  "ก.ค.": 7,
  "ส.ค.": 8,
  "ก.ย.": 9,
  "ต.ค.": 10,
  "พ.ย.": 11,
  "ธ.ค.": 12,
  // Thai abbreviated months (without trailing dot)
  "ม.ค": 1,
  "ก.พ": 2,
  "มี.ค": 3,
  "เม.ย": 4,
  "พ.ค": 5,
  "มิ.ย": 6,
  "ก.ค": 7,
  "ส.ค": 8,
  "ก.ย": 9,
  "ต.ค": 10,
  "พ.ย": 11,
  "ธ.ค": 12,
  // Thai abbreviated months (no dots at all)
  "มค": 1,
  "กพ": 2,
  "มีค": 3,
  "เมย": 4,
  "พค": 5,
  "มิย": 6,
  "กค": 7,
  "สค": 8,
  "กย": 9,
  "ตค": 10,
  "พย": 11,
  "ธค": 12,
  // Thai full months
  "มกราคม": 1,
  "กุมภาพันธ์": 2,
  "มีนาคม": 3,
  "เมษายน": 4,
  "พฤษภาคม": 5,
  "มิถุนายน": 6,
  "กรกฎาคม": 7,
  "สิงหาคม": 8,
  "กันยายน": 9,
  "ตุลาคม": 10,
  "พฤศจิกายน": 11,
  "ธันวาคม": 12,
};

// Asia/Bangkok has been UTC+7 year-round with no DST since 1920 — safe to
// hard-code as the app-wide default offset for sourceless timezone data.
const DEFAULT_TIMEZONE_OFFSET = "+07:00";

export const TIMESTAMP_INVALID_WARNING_TH =
  "พบข้อความวันที่ในเอกสารแต่ไม่สามารถแปลงเป็นวันที่ที่ถูกต้องได้ กรุณาตรวจสอบและกรอกวันที่ให้ถูกต้อง";
export const TIMESTAMP_AMBIGUOUS_WARNING_TH =
  "พบวันที่ในรูปแบบตัวเลขที่ตีความได้หลายแบบ (วัน/เดือน หรือ เดือน/วัน) กรุณาระบุวันที่ให้ชัดเจน";

const ISO_LIKE_PATTERN = /^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

// "11 Jul 26", "11 Jul 2026", "11 July 2026", optionally "07:26" and/or
// "+0700" / "+07:00". Also supports Thai month names and Buddhist Era years.
const TEXTUAL_DATE_PATTERN =
  /^(\d{1,2})\s+([A-Za-z\u0e00-\u0e7f\.]+)\s+(\d{2}|\d{4})(?:[,\s\-]+(?:เวลา\s+)?(\d{1,2}):(\d{2}))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?\s*$/;

// "07/11/2026", "11/07/2026", "07-11-2026" — numeric, locale-ambiguous.
const NUMERIC_DATE_PATTERN =
  /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2}|\d{4})(?:[,\sT]+(\d{1,2}):(\d{2}))?(?:\s*(Z|[+-]\d{2}:?\d{2}))?\s*$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeOffset(raw: string | undefined): string {
  if (!raw || raw === "Z") return raw === "Z" ? "Z" : DEFAULT_TIMEZONE_OFFSET;
  const compact = raw.match(/^([+-])(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}${compact[2]}:${compact[3]}`;
  return raw;
}

function resolveYear(yearStr: string): number {
  let yearNum = Number(yearStr);
  if (yearStr.length === 2) {
    if (yearNum > 40) {
      // E.g. 69 indicates 2569 BE, which is 2026 AD
      yearNum = (yearNum + 2500) - 543;
    } else {
      yearNum += 2000;
    }
  } else if (yearNum > 2400) {
    yearNum -= 543;
  }
  return yearNum;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isValidTime(hour: number, minute: number): boolean {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function buildResult(
  year: number,
  month: number,
  day: number,
  hourStr: string | undefined,
  minuteStr: string | undefined,
  offsetStr: string | undefined,
): TimestampParseResult {
  if (!isValidCalendarDate(year, month, day)) {
    return { state: "invalid", warning: TIMESTAMP_INVALID_WARNING_TH };
  }
  const datePart = `${year}-${pad2(month)}-${pad2(day)}`;

  if (hourStr !== undefined && minuteStr !== undefined) {
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (!isValidTime(hour, minute)) {
      return { state: "invalid", warning: TIMESTAMP_INVALID_WARNING_TH };
    }
    const offset = normalizeOffset(offsetStr);
    return { state: "extracted", iso: `${datePart}T${pad2(hour)}:${pad2(minute)}:00${offset}` };
  }

  // Date known, time not present in the source — infer a neutral noon
  // placeholder (matches this app's existing manual-entry convention)
  // rather than ever substituting the current wall-clock time.
  return { state: "inferred", iso: `${datePart}T12:00:00${DEFAULT_TIMEZONE_OFFSET}` };
}

/**
 * Parses a document-extracted timestamp candidate into a normalized ISO
 * string, or reports why it couldn't. Never returns the current date/time
 * as a substitute for an unparseable or missing value.
 */
export function parseDocumentTimestamp(raw: unknown): TimestampParseResult {
  if (raw === undefined || raw === null) return { state: "missing" };
  if (typeof raw !== "string") return { state: "invalid", warning: TIMESTAMP_INVALID_WARNING_TH };

  const trimmed = raw.trim();
  if (trimmed.length === 0) return { state: "missing" };

  // 1. Already ISO-shaped — trust it directly (fast path; keeps existing
  //    Gemini-returns-clean-ISO behavior, including current mocks, unchanged).
  if (ISO_LIKE_PATTERN.test(trimmed)) {
    const hasTime = /[T\s]\d{2}:\d{2}/.test(trimmed);
    const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
    let normalized = trimmed.replace(" ", "T");

    // A 4-digit year > 2400 in an otherwise ISO-shaped candidate is a
    // Buddhist Era year printed in ISO form (e.g. a "2569-07-05" slip
    // date), not a Gregorian year — convert it before trusting the fast
    // path, exactly like resolveYear() does for the textual/numeric
    // paths below. Wall-clock time and offset are preserved untouched.
    const beYearMatch = normalized.match(/^(\d{4})-/);
    if (beYearMatch && Number(beYearMatch[1]) > 2400) {
      const gregorianYear = Number(beYearMatch[1]) - 543;
      normalized = `${String(gregorianYear).padStart(4, "0")}${normalized.slice(4)}`;
    }

    // Only date-only strings are ambiguous to the native parser without an
    // explicit UTC marker; time-bearing strings without an offset already
    // parse fine (as local time) purely for validity-checking purposes.
    const probe = new Date(hasTime || hasOffset ? normalized : `${normalized}T00:00:00Z`);
    if (Number.isNaN(probe.getTime())) {
      return { state: "invalid", warning: TIMESTAMP_INVALID_WARNING_TH };
    }
    if (!hasTime) {
      return { state: "inferred", iso: `${normalized}T12:00:00${DEFAULT_TIMEZONE_OFFSET}` };
    }
    if (!hasOffset) {
      return { state: "extracted", iso: `${normalized}${DEFAULT_TIMEZONE_OFFSET}` };
    }
    return { state: "extracted", iso: normalized };
  }

  // 2. "11 Jul 26 07:26 +0700" / "11 Jul 2026" / "11 July 2026" — day always
  //    leads, so this can never be misread as MM/DD/YYYY.
  const textual = trimmed.match(TEXTUAL_DATE_PATTERN);
  if (textual) {
    const [, dayStr, monthStr, yearStr, hourStr, minuteStr, offsetStr] = textual;
    let monthKey = monthStr.toLowerCase();
    if (!MONTH_NAMES[monthKey] && monthKey.endsWith(".")) {
      const withoutTrailing = monthKey.slice(0, -1);
      if (MONTH_NAMES[withoutTrailing]) {
        monthKey = withoutTrailing;
      }
    }
    const month = MONTH_NAMES[monthKey];
    if (!month) return { state: "invalid", warning: TIMESTAMP_INVALID_WARNING_TH };
    return buildResult(resolveYear(yearStr), month, Number(dayStr), hourStr, minuteStr, offsetStr);
  }

  // 3. Fully numeric slash/dash dates are inherently locale-ambiguous
  //    (DD/MM vs MM/DD). Only resolve when one component is unambiguously
  //    > 12 (it must be the day); otherwise, do not guess.
  const numeric = trimmed.match(NUMERIC_DATE_PATTERN);
  if (numeric) {
    const [, aStr, bStr, yearStr, hourStr, minuteStr, offsetStr] = numeric;
    const a = Number(aStr);
    const b = Number(bStr);
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      day = b;
      month = a;
    } else {
      return { state: "invalid", warning: TIMESTAMP_AMBIGUOUS_WARNING_TH };
    }
    return buildResult(resolveYear(yearStr), month, day, hourStr, minuteStr, offsetStr);
  }

  // A candidate value exists but matches none of the supported shapes.
  return { state: "invalid", warning: TIMESTAMP_INVALID_WARNING_TH };
}
