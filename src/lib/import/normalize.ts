const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_FULL_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม"
];
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseThaiBuddhistYearDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  
  const cleanStr = dateStr.trim();
  
  if (cleanStr.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(cleanStr)) {
    const parsed = new Date(cleanStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const cleanLower = cleanStr.toLowerCase();
  const parts = cleanLower.split(/[\/\-\s,]+/);
  
  if (parts.length < 3) {
    // If not matching, try standard Date parsing
    const parsed = new Date(cleanStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return new Date().toISOString();
  }

  const dayStr = parts[0];
  const monthStr = parts[1];
  const yearStr = parts[2];

  // Try parsing month by name
  let monthIdx = -1;
  // Check Thai short month name
  monthIdx = TH_MONTHS.findIndex(m => monthStr.includes(m.replace(".", "")));
  if (monthIdx === -1) {
    // Check Thai full month name
    monthIdx = TH_FULL_MONTHS.findIndex(m => monthStr.includes(m));
  }
  if (monthIdx === -1) {
    // Check English month name
    monthIdx = EN_MONTHS.findIndex(m => monthStr.includes(m));
  }
  
  const monthNum = monthIdx !== -1 ? monthIdx + 1 : parseInt(monthStr, 10);
  const dayNum = parseInt(dayStr, 10);
  let yearNum = parseInt(yearStr, 10);

  if (isNaN(dayNum) || isNaN(monthNum) || isNaN(yearNum)) {
    return new Date().toISOString();
  }

  // Adjust Buddhist year (typically Year > 2400)
  if (yearNum > 2400) {
    yearNum -= 543;
  } else if (yearNum < 100) {
    // Handling two digit years (e.g. 26 -> 2026, 69 -> 2069/2569 Buddhist year)
    if (yearNum > 40) {
      // e.g. 69 indicates 2569 BE, which is 2026 AD
      // Let's assume two-digit years > 40 are Buddhist BE years
      yearNum = BEToAD(yearNum + 2500);
    } else {
      yearNum += 2000;
    }
  }

  // Handle optional time parts if dateStr contains them
  let hour = 12;
  let minute = 0;
  let second = 0;
  if (parts[3]) {
    const timeParts = parts[3].split(":");
    if (timeParts[0]) hour = parseInt(timeParts[0], 10);
    if (timeParts[1]) minute = parseInt(timeParts[1], 10);
    if (timeParts[2]) second = parseInt(timeParts[2], 10);
  }

  // Create date and return ISO String
  const utcDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum, hour, minute, second));
  return utcDate.toISOString();
}

function BEToAD(beYear: number): number {
  return beYear - 543;
}

export function parseAmountSatang(amountStr: string): number {
  if (!amountStr) return 0;
  let cleanStr = amountStr.trim().replace(/,/g, "");

  // Parentheses check e.g. (1,234.56) or (120)
  const isNegative = cleanStr.startsWith("(") && cleanStr.endsWith(")");
  if (isNegative) {
    cleanStr = cleanStr.substring(1, cleanStr.length - 1);
  }

  const num = parseFloat(cleanStr);
  if (isNaN(num)) return 0;

  // Convert to satang (round to prevent float errors)
  const val = Math.round(num * 100);
  return isNegative ? -val : val;
}
