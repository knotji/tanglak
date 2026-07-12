export function formatInstallments(months: number | null): string {
  if (months === null) return "ไม่ระบุ";
  return `${months} งวด`;
}

export function formatPercent(rate: number): string {
  return `${Number(rate.toFixed(2))}%`;
}

export function formatThaiDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const thaiYear = date.getFullYear() + 543;
  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${thaiYear}`;
}
