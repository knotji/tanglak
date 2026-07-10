import type { DetectedLayout, ExtractedDocument, ExtractedLine, LayoutColumn, LayoutColumnRole } from "./types";

const HEADER_SEARCH_ZONE = 10;
// Minimum horizontal gap (PDF points) between text items to consider them
// separate table columns rather than words within the same header label.
const COLUMN_GAP_THRESHOLD = 12;

const ROLE_KEYWORDS: Array<{ role: LayoutColumnRole; keywords: RegExp }> = [
  { role: "posted_date", keywords: /post(?:ing|ed)? date|effective date|วันที่บันทึก|วันที่ทำรายการ/i },
  { role: "time", keywords: /^time$|เวลา/i },
  { role: "date", keywords: /date|วันที่/i },
  { role: "debit", keywords: /withdrawal|debit|ถอน|หัก\s*บัญชี|รายการหัก/i },
  { role: "credit", keywords: /deposit|credit|ฝาก|เข้า\s*บัญชี|รายการเข้า/i },
  { role: "balance", keywords: /balance|คงเหลือ/i },
  { role: "reference", keywords: /reference|ref\.?\s*no|เลขที่อ้างอิง|transaction id/i },
  { role: "amount", keywords: /amount|จำนวนเงิน|จำนวน/i },
  { role: "description", keywords: /description|detail|particular|memo|รายการ|รายละเอียด/i },
];

function classifyToken(token: string): LayoutColumnRole | null {
  const clean = token.trim();
  if (!clean) return null;
  for (const { role, keywords } of ROLE_KEYWORDS) {
    if (keywords.test(clean)) return role;
  }
  return null;
}

function isWithdrawalWording(headerText: string): boolean {
  return /withdrawal|deposit|ถอน|ฝาก/i.test(headerText);
}

/** Clusters a header line's positioned text items into pseudo-columns by x-gap. */
function clusterHeaderColumns(line: ExtractedLine): LayoutColumn[] {
  const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
  const groups: { xStart: number; texts: string[] }[] = [];

  for (const item of sortedItems) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && item.x - (lastGroup.xStart + lastGroup.texts.join(" ").length * 4.5) < COLUMN_GAP_THRESHOLD) {
      lastGroup.texts.push(item.text);
    } else {
      groups.push({ xStart: item.x, texts: [item.text] });
    }
  }

  return groups.map((group, index) => ({
    role: (classifyToken(group.texts.join(" ")) ?? "ignore") as LayoutColumnRole,
    headerLabel: group.texts.join(" ").trim(),
    index,
    xStart: group.xStart,
    xEnd: groups[index + 1]?.xStart ?? group.xStart + 400,
  }));
}

export function detectGenericLayout(doc: ExtractedDocument): DetectedLayout {
  let best: DetectedLayout | null = null;
  const page = doc.pages[0];
  if (!page) {
    return { layoutId: "unsupported", columns: [], confidence: 0, warnings: ["ไม่พบหน้าเอกสาร"], source: "deterministic" };
  }

  for (const line of page.lines.slice(0, HEADER_SEARCH_ZONE)) {
    const columns = clusterHeaderColumns(line);
    if (columns.length < 3) continue;

    const seenRoles = new Set(columns.map((c) => c.role));
    const hasDate = seenRoles.has("date");
    const hasAmountLike = seenRoles.has("amount") || seenRoles.has("debit") || seenRoles.has("credit");
    if (!hasDate || !hasAmountLike) continue;

    // Infer a description column from the widest unlabeled gap between the
    // date-ish and amount-ish columns when the header doesn't spell it out.
    if (!seenRoles.has("description")) {
      const dateCol = columns.find((c) => c.role === "date" || c.role === "posted_date" || c.role === "time");
      const firstAmountCol = columns.find((c) => ["amount", "debit", "credit", "balance"].includes(c.role));
      if (dateCol && firstAmountCol) {
        const between = columns.filter(
          (c) => c.role === "ignore" && c.index > dateCol.index && c.index < firstAmountCol.index,
        );
        if (between.length > 0) {
          between[0].role = "description";
          seenRoles.add("description");
        }
      }
    }

    let layoutId: DetectedLayout["layoutId"] = "unsupported";
    if (seenRoles.has("debit") && seenRoles.has("credit")) {
      layoutId = isWithdrawalWording(line.text) ? "D" : "A";
    } else if (seenRoles.has("posted_date")) {
      layoutId = "C";
    } else if (seenRoles.has("time")) {
      layoutId = "E";
    } else if (seenRoles.has("amount") && seenRoles.has("balance")) {
      layoutId = "B";
    } else if (seenRoles.has("amount")) {
      layoutId = "F";
    }

    let confidence = 0.4;
    confidence += seenRoles.has("description") ? 0.2 : 0;
    confidence += seenRoles.has("balance") ? 0.15 : 0;
    confidence += seenRoles.has("debit") && seenRoles.has("credit") ? 0.15 : 0;
    confidence += seenRoles.has("reference") ? 0.05 : 0;
    confidence = Math.min(1, confidence);

    const candidate: DetectedLayout = {
      layoutId,
      columns,
      headerPageNumber: page.pageNumber,
      headerLineIndex: line.lineIndex,
      headerText: line.text,
      confidence,
      warnings: seenRoles.has("description") ? [] : ["ไม่พบคอลัมน์รายละเอียดที่ชัดเจน อาจต้องตรวจสอบด้วยตนเอง"],
      source: "deterministic",
    };

    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    }
  }

  if (!best) {
    return {
      layoutId: "unsupported",
      columns: [],
      confidence: 0,
      warnings: ["ไม่พบหัวตารางที่รู้จัก"],
      source: "deterministic",
    };
  }

  return best;
}
