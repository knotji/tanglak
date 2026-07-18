/**
 * Gets the current local date in Bangkok (Asia/Bangkok) as a YYYY-MM-DD string.
 */
export function getBangkokTodayString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${year}-${month}-${day}`;
}

/**
 * Converts an arbitrary ISO instant (any offset -- `Z`, `+00:00`, `+07:00`,
 * etc.) to its Bangkok-local `YYYY-MM-DD` calendar date. Use this instead of
 * `occurredAt.slice(0, 10)` / `.startsWith(dateKey)` whenever the string's
 * literal offset isn't guaranteed to already be `+07:00` -- Supabase
 * (PostgREST) returns `timestamptz` columns normalized to UTC, so a naive
 * string-prefix check silently mis-buckets any transaction whose Bangkok
 * wall-clock date differs from its UTC calendar date (any time from
 * 00:00-06:59 Bangkok, whose UTC date is still the previous day). This is
 * the root cause of a real production bug where Overview/Budget undercounted
 * transactions that Today/Transactions counted correctly.
 */
export function getBangkokDateOf(isoInstant: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoInstant));
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${year}-${month}-${day}`;
}

/**
 * Converts an arbitrary ISO instant to its Bangkok-local `YYYY-MM` calendar
 * month. See getBangkokDateOf for why this must not be a naive string-prefix
 * check.
 */
export function getBangkokMonthOf(isoInstant: string): string {
  return getBangkokDateOf(isoInstant).slice(0, 7);
}

/**
 * Gets the current Bangkok wall-clock date/time as a `YYYY-MM-DDTHH:mm`
 * string suitable for a `datetime-local` input's default value. Using
 * `new Date().toISOString()` for this purpose is a known footgun: it
 * returns UTC, but `datetime-local` treats whatever string it's given as
 * plain wall-clock time with no timezone conversion — so a UTC value ends
 * up displayed as if it were already Bangkok time, silently off by up to
 * 7 hours (and by a full day near local midnight).
 */
export function getBangkokNowDateTimeLocalString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Gets the current local month in Bangkok (Asia/Bangkok) as a YYYY-MM string.
 */
export function getBangkokMonthString(date: Date = new Date()): string {
  return getBangkokTodayString(date).slice(0, 7);
}

const MONTH_QUERY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;

export function isValidMonthQuery(value: unknown): value is string {
  return typeof value === "string" && MONTH_QUERY_PATTERN.test(value);
}

export function resolveBangkokMonthQuery(value: unknown, fallbackDate: Date = new Date()): string {
  return isValidMonthQuery(value) ? value : getBangkokMonthString(fallbackDate);
}

export function shiftMonth(month: string, offset: number): string {
  if (!isValidMonthQuery(month)) {
    throw new Error("Invalid month");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthNumber: number): number {
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function getBangkokMonthRange(month = getBangkokMonthString()): {
  startDate: string;
  endDate: string;
  startInstant: string;
  endExclusiveInstant: string;
} {
  if (!isValidMonthQuery(month)) {
    throw new Error("Invalid month");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(daysInMonth(year, monthNumber)).padStart(2, "0")}`;
  return {
    startDate,
    endDate,
    startInstant: bangkokDateStartInstant(startDate),
    endExclusiveInstant: bangkokDateStartInstant(shiftDateKey(endDate, 1)),
  };
}

export function bangkokDateStartInstant(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    throw new Error("Invalid date");
  }
  return `${dateKey}T00:00:00+07:00`;
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function shiftDateKey(dateKey: string, offsetDays: number): string {
  if (!isValidDateKey(dateKey)) {
    throw new Error("Invalid date");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Shifts a date key by whole calendar months, clamping the day to the
 * target month's actual length rather than overflowing into a later month
 * (e.g. 2026-03-31 shifted back 1 month lands on 2026-02-28, not
 * 2026-03-03 -- a naive `Date.UTC(year, month - 1 + offset, day)` would
 * silently roll over because February has fewer than 31 days).
 */
export function shiftDateKeyByMonths(dateKey: string, monthOffset: number): string {
  if (!isValidDateKey(dateKey)) {
    throw new Error("Invalid date");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const zeroBasedTarget = month - 1 + monthOffset;
  const targetYear = year + Math.floor(zeroBasedTarget / 12);
  const targetMonthIndex = ((zeroBasedTarget % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

/**
 * Derives a debt's billing-cycle window from its due date, for use only
 * when a debt is first created with no explicit cycle_start_date/
 * cycle_end_date supplied. The cycle ends on the due date itself and
 * starts the day after the equivalent due date one month earlier (e.g. a
 * due date of 2026-07-02 yields a cycle of 2026-06-03 through
 * 2026-07-02) -- this only ever runs once, at debt creation; it is not a
 * recurring rollover mechanism (there is currently none), and it never
 * overwrites an existing debt's cycle dates.
 */
export function deriveDebtCycleFromDueDate(dueDate: string): { cycleStartDate: string; cycleEndDate: string } {
  if (!isValidDateKey(dueDate)) {
    throw new Error("Invalid date");
  }
  const previousDueDate = shiftDateKeyByMonths(dueDate, -1);
  return {
    cycleStartDate: shiftDateKey(previousDueDate, 1),
    cycleEndDate: dueDate,
  };
}

/**
 * Advances a debt's stored cycle window forward until its end date is no
 * longer in the past relative to `today` -- or returns null if the current
 * window already covers `today` (no rollover needed). A debt that hasn't
 * been read in months rolls forward directly to the correct cycle in one
 * call rather than requiring one call per elapsed cycle.
 *
 * Each candidate month-offset is computed from the *original*
 * cycleStartDate/cycleEndDate (via shiftDateKeyByMonths), never by
 * compounding onto the previous step's already-clamped result. A debt due
 * on the 31st that rolls through February (clamped to the 28th/29th) must
 * return to the 31st in March, not stay permanently pinned to 28 the way
 * repeated `shiftDateKeyByMonths(previousResult, 1)` calls would --
 * clamping is a property of the target month, re-evaluated fresh every
 * time against the original day-of-month, not a mutation that should
 * accumulate.
 *
 * This only ever operates on an already-set cycle window (both dates
 * present) -- a debt with no cycle dates at all still uses the calendar-
 * month fallback in `getDebtCycleWindow`, which self-corrects every month
 * on its own and has nothing to roll forward.
 *
 * Also returns `monthsElapsed` so the caller can shift the debt's
 * `due_date` by the same amount -- due_date and cycle_end_date are set
 * equal at creation (see `deriveDebtCycleFromDueDate`) and are meant to
 * always represent the same underlying due date; rolling the cycle
 * window forward without also advancing due_date would leave the debt
 * permanently displaying a stale, already-passed due date (and an
 * incorrect "overdue" status) even after the debt is fully current on
 * its new cycle.
 */
export function rollDebtCycleForward(
  cycleStartDate: string,
  cycleEndDate: string,
  today: string,
): { cycleStartDate: string; cycleEndDate: string; monthsElapsed: number } | null {
  if (!isValidDateKey(cycleStartDate) || !isValidDateKey(cycleEndDate) || !isValidDateKey(today)) {
    throw new Error("Invalid date");
  }
  if (today <= cycleEndDate) return null;

  let monthsElapsed = 0;
  let end = cycleEndDate;
  while (end < today) {
    monthsElapsed += 1;
    end = shiftDateKeyByMonths(cycleEndDate, monthsElapsed);
  }
  return {
    cycleStartDate: shiftDateKeyByMonths(cycleStartDate, monthsElapsed),
    cycleEndDate: end,
    monthsElapsed,
  };
}

export function getDebtCycleWindow(
  debt: { cycleStartDate?: string; cycleEndDate?: string },
  fallbackDate: Date = new Date(),
): {
  startDate: string;
  endDate: string;
  startInstant: string;
  endExclusiveInstant: string;
  isFallback: boolean;
} {
  if (debt.cycleStartDate && debt.cycleEndDate) {
    if (!isValidDateKey(debt.cycleStartDate) || !isValidDateKey(debt.cycleEndDate)) {
      throw new Error("Invalid debt cycle date");
    }
    if (debt.cycleStartDate > debt.cycleEndDate) {
      throw new Error("Debt cycle start date must be before end date");
    }
    return {
      startDate: debt.cycleStartDate,
      endDate: debt.cycleEndDate,
      startInstant: bangkokDateStartInstant(debt.cycleStartDate),
      endExclusiveInstant: bangkokDateStartInstant(shiftDateKey(debt.cycleEndDate, 1)),
      isFallback: false,
    };
  }

  return { ...getBangkokMonthRange(getBangkokMonthString(fallbackDate)), isFallback: true };
}

export function formatBangkokMonthLabel(month: string): string {
  if (!isValidMonthQuery(month)) {
    throw new Error("Invalid month");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "Asia/Bangkok",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

/**
 * Formats a date as a compact Thai string, e.g. "14 ก.ค."
 * Uses Asia/Bangkok timezone.
 */
export function formatThaiDateCompact(date: Date | string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
  }).format(new Date(date));
}

/**
 * Formats a date as a full Thai string, e.g. "14 ก.ค. 2026"
 * Uses Asia/Bangkok timezone.
 */
export function formatThaiDateFull(date: Date | string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

/**
 * Formats a date as a Thai date/time string, e.g. "14 ก.ค. 2026 เวลา 11:51"
 * Uses Asia/Bangkok timezone.
 */
export function formatThaiDateTime(date: Date | string): string {
  const d = new Date(date);
  const dateLabel = formatThaiDateFull(d);
  const timeLabel = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${dateLabel} เวลา ${timeLabel}`;
}

const DATETIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Parses a `datetime-local` input value (`YYYY-MM-DDTHH:mm`) into its raw
 * numeric components, validating both the shape and the calendar/clock
 * ranges. Returns `null` for anything malformed or out of range — this never
 * falls back to a `Date` parse, since `Date` silently accepts and rolls over
 * out-of-range values (e.g. day 32) instead of rejecting them.
 */
export function parseWallClockComponents(value: string): WallClockParts | null {
  const match = DATETIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

/**
 * Formats a `datetime-local` value as an unambiguous Thai date/time label,
 * e.g. "11 ก.ค. 2026 เวลา 07:26". The value is treated as plain Bangkok
 * wall-clock text — the same convention `datetime-local` itself uses — so no
 * timezone conversion happens here; only the calendar date portion is passed
 * through `Intl` (pinned to `timeZone: "UTC"` on a `Date.UTC` built from the
 * same Y/M/D so no shift is possible), while the time is formatted directly
 * from the parsed digits.
 */
export function formatThaiDateTimeLabel(value: string): string | null {
  const parts = parseWallClockComponents(value);
  if (!parts) return null;
  const dateLabel = formatThaiDateLabel(`${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`);
  const timeLabel = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return `${dateLabel} เวลา ${timeLabel}`;
}

/**
 * Formats a `YYYY-MM-DD` date key into an unambiguous Thai date label,
 * e.g. "15 พ.ค. 2025". This is used for displaying release dates and other
 * date-only values in Thai.
 */
export function formatThaiDateLabel(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    throw new Error("Invalid date");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Final transaction-confirmation validation copy, shared by the review
 * server action and the review UI's client-side pre-check. Occurred-at is
 * required at this boundary (unlike draft extraction) and is never
 * fabricated -- no current time, upload time, or guessed date. Used for
 * both "missing" and "invalid" cases, per product's single required Thai
 * message.
 */
export const TRANSACTION_OCCURRED_AT_REQUIRED_TH = "กรุณาระบุวันที่และเวลาของรายการ";

/**
 * Converts a validated `datetime-local` wall-clock value (`YYYY-MM-DDTHH:mm`,
 * as produced by `parseWallClockComponents`) into a Bangkok-offset ISO
 * instant (`YYYY-MM-DDTHH:mm:00+07:00`), matching the fixed-offset
 * convention already used by `bangkokDateStartInstant`. This reads the exact
 * digits the user saw and entered -- it never round-trips through `new
 * Date()` (which would reinterpret an offset-less string using the server's
 * own timezone and can silently shift the instant) and never substitutes
 * any other date/time.
 */
export function bangkokDateTimeLocalToInstant(value: string): string {
  const parts = parseWallClockComponents(value);
  if (!parts) {
    throw new Error("Invalid date");
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:00+07:00`;
}

/**
 * Heuristic for whether an already-normalized ISO `occurredAt` is likely the
 * noon placeholder `parseDocumentTimestamp` (see `src/lib/ai/timestamp.ts`)
 * emits when a source document has a date but no time. That parser is
 * intentionally not re-invoked or modified here — this only recognizes its
 * documented output shape, purely for review-form display purposes.
 */
export function isLikelyInferredNoonTimestamp(occurredAt: string | undefined): boolean {
  if (!occurredAt) return false;
  return /T12:00:00(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(occurredAt);
}

/**
 * Formats an ISO instant or wall-clock string as standard DD/MM/YYYY HH:mm
 */
export function formatStandardDateTime(value: string | undefined): string {
  if (!value) return "ไม่ระบุวันเวลา";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/**
 * Converts an ISO instant to its Bangkok-local YYYY-MM-DDTHH:mm string.
 */
export function getBangkokDateTimeLocalOf(isoInstant: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoInstant));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Formats a `datetime-local` input's raw value (`YYYY-MM-DDTHH:mm`, no
 * offset, already Bangkok wall-clock -- see getBangkokDateTimeLocalOf /
 * getBangkokNowDateTimeLocalString) as a Thai-readable confirmation string
 * via the existing formatThaiDateTime convention, e.g.
 * "15 ก.ค. 2026 เวลา 16:46". Native `datetime-local` controls render in
 * whatever format the browser/OS locale dictates (often US `MM/DD/YYYY
 * hh:mm AM/PM`), which is inconsistent with the rest of this Thai-first
 * app -- this gives users an unambiguous read-out of what will actually be
 * saved regardless of that native rendering.
 */
export function formatBangkokDateTimeLocalThai(value: string): string {
  if (!parseWallClockComponents(value)) return "";
  return formatThaiDateTime(bangkokDateTimeLocalToInstant(value));
}

export type DateTimeParseResult =
  | { ok: true; isoInstant: string; type: "date-only" | "datetime" }
  | { ok: false; error: string };

/**
 * Parses and strictly validates a date/time input from financial forms.
 * Accepts YYYY-MM-DD (date-only) and YYYY-MM-DDTHH:mm (datetime-local),
 * validating calendar existence, leap years, and time ranges.
 * Pinning offset to Asia/Bangkok (+07:00) strictly to avoid machine timezone shift.
 */
export function parseAndValidateDateTime(value: unknown): DateTimeParseResult {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "กรุณาระบุวันที่ให้ถูกต้อง" };
  }

  const trimmed = value.trim();

  // 1. Try matching YYYY-MM-DD
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);

    if (month < 1 || month > 12) {
      return { ok: false, error: "วันที่นี้ไม่มีอยู่จริง" };
    }

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > daysInMonth) {
      return { ok: false, error: "วันที่นี้ไม่มีอยู่จริง" };
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      ok: true,
      isoInstant: `${year}-${pad(month)}-${pad(day)}T12:00:00+07:00`,
      type: "date-only",
    };
  }

  // 2. Try matching YYYY-MM-DDTHH:mm (or YYYY-MM-DDTHH:mm:ss etc.)
  if (trimmed.includes("T")) {
    const parts = trimmed.split("T");
    if (parts.length === 2) {
      const datePart = parts[0];
      const timePart = parts[1];

      // Validate date portion
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
      if (!dateMatch) {
        return { ok: false, error: "กรุณาระบุวันที่ให้ถูกต้อง" };
      }

      const year = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const day = Number(dateMatch[3]);

      if (month < 1 || month > 12) {
        return { ok: false, error: "วันที่นี้ไม่มีอยู่จริง" };
      }

      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day < 1 || day > daysInMonth) {
        return { ok: false, error: "วันที่นี้ไม่มีอยู่จริง" };
      }

      // Validate time portion (HH:mm or HH:mm:ss, optional seconds, optional offset)
      const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(timePart);
      if (!timeMatch) {
        return { ok: false, error: "กรุณาระบุเวลาให้ถูกต้อง" };
      }

      const hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2]);
      const second = timeMatch[3] ? Number(timeMatch[3]) : 0;

      if (hour < 0 || hour > 23) {
        return { ok: false, error: "กรุณาระบุเวลาให้ถูกต้อง" };
      }

      if (minute < 0 || minute > 59) {
        return { ok: false, error: "กรุณาระบุเวลาให้ถูกต้อง" };
      }

      if (second < 0 || second > 59) {
        return { ok: false, error: "กรุณาระบุเวลาให้ถูกต้อง" };
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        ok: true,
        isoInstant: `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+07:00`,
        type: "datetime",
      };
    }
  }

  return { ok: false, error: "วันและเวลาไม่ถูกต้อง" };
}
