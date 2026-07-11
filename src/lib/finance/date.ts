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
