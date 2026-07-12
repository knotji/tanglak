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
  const dateLabel = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
  const timeLabel = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return `${dateLabel} เวลา ${timeLabel}`;
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
