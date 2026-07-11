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
