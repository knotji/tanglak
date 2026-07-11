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
