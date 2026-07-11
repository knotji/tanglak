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
