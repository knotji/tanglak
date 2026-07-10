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

export function formatTHB(satang: number): string {
  const sign = satang < 0 ? "-" : "";
  const amount = new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: satang % 100 === 0 ? 0 : 2,
  }).format(Math.abs(satangToBaht(satang)));

  return `${sign}฿${amount}`;
}
