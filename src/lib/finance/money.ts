export function bahtToSatang(value: string | number): number {
  const normalized = String(value).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Invalid baht amount");
  }

  const [bahtPart, satangPart = ""] = normalized.split(".");
  const sign = bahtPart.startsWith("-") ? -1 : 1;
  const absoluteBaht = Math.abs(Number(bahtPart));
  const satang = Number(satangPart.padEnd(2, "0"));

  return sign * (absoluteBaht * 100 + satang);
}

export function satangToBaht(satang: number): number {
  return satang / 100;
}

function normalizeSatang(satang: number): number {
  return Object.is(satang, -0) ? 0 : satang;
}

export function formatTHB(satang: number, options: { showPositiveSign?: boolean } = {}): string {
  const normalized = normalizeSatang(satang);
  const sign = normalized < 0 ? "-" : options.showPositiveSign && normalized > 0 ? "+" : "";
  const amount = new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: normalized % 100 === 0 ? 0 : 2,
  }).format(Math.abs(satangToBaht(normalized)));

  return `${sign}฿${amount}`;
}
