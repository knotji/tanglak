import type { ImportParser, ParseResult, ParsedTransaction } from "../types";
import { detectCSVDelimiter, detectCSVHeaders } from "../validators";
import { parseAmountSatang, parseThaiBuddhistYearDate } from "../normalize";
import { isMockAuthEnabled } from "@/lib/auth/session";

export class GenericCreditCardCSVParser implements ImportParser {
  name = "generic-credit-card-csv";
  version = "1.0.0";

  async canParse(fileExtension: string, mimeType: string, firstBytes: string): Promise<boolean> {
    return (
      (fileExtension === "csv" || mimeType === "text/csv") &&
      (firstBytes.toLowerCase().includes("credit") || firstBytes.toLowerCase().includes("card") || firstBytes.toLowerCase().includes("บัตร"))
    );
  }

  async parse(fileData: Buffer | string): Promise<ParseResult> {
    if (isMockAuthEnabled()) {
      return this.getMockResult();
    }

    const text = typeof fileData === "string" ? fileData : fileData.toString("utf8");
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      throw new Error("CSV file is empty");
    }

    const delimiter = detectCSVDelimiter(lines[0]);
    const headers = lines[0].split(delimiter).map(h => h.replace(/^["']|["']$/g, "").trim());
    const mapping = detectCSVHeaders(headers);

    const rows: ParsedTransaction[] = [];
    let periodStart: string | undefined;
    let periodEnd: string | undefined;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(delimiter).map(c => c.replace(/^["']|["']$/g, "").trim());
      if (cols.length < Math.max(mapping.dateIdx, mapping.descriptionIdx)) continue;

      const rawDate = cols[mapping.dateIdx];
      const description = cols[mapping.descriptionIdx] || "ไม่ระบุรายละเอียด";

      let occurredAt = new Date().toISOString();
      try {
        occurredAt = parseThaiBuddhistYearDate(rawDate);
      } catch (_e) {}

      if (!periodStart || occurredAt < periodStart) periodStart = occurredAt;
      if (!periodEnd || occurredAt > periodEnd) periodEnd = occurredAt;

      let amountSatang = 0;
      let direction: "credit" | "debit" | "unknown" = "unknown";

      if (mapping.debitIdx !== -1 && cols[mapping.debitIdx]) {
        const val = parseAmountSatang(cols[mapping.debitIdx]);
        if (val > 0) {
          amountSatang = val;
          direction = "debit"; // withdrawal / expense
        }
      }
      
      if (amountSatang === 0 && mapping.creditIdx !== -1 && cols[mapping.creditIdx]) {
        const val = parseAmountSatang(cols[mapping.creditIdx]);
        if (val > 0) {
          amountSatang = val;
          direction = "credit"; // payment to credit card / credit
        }
      }

      if (amountSatang === 0 && mapping.amountIdx !== -1 && cols[mapping.amountIdx]) {
        const val = parseAmountSatang(cols[mapping.amountIdx]);
        amountSatang = Math.abs(val);
        // Standard credit card behavior: charge/purchases are debit/expense (positive values)
        // Payments/refunds are credit (negative values, or vice versa depending on formatting)
        direction = val < 0 ? "credit" : "debit";
      }

      // Check description keywords to adjust suggestions
      let suggestedType: "expense" | "income" | "debt_payment" | "transfer" | undefined = "expense";
      let suggestedCategory = "อื่น ๆ";

      const lowercaseDesc = description.toLowerCase();
      if (lowercaseDesc.includes("payment") || lowercaseDesc.includes("ชำระ") || lowercaseDesc.includes("โอน")) {
        suggestedType = "debt_payment";
        direction = "credit";
      } else if (lowercaseDesc.includes("fee") || lowercaseDesc.includes("ค่าธรรมเนียม")) {
        suggestedCategory = "ค่าธรรมเนียม";
      } else if (lowercaseDesc.includes("interest") || lowercaseDesc.includes("ดอกเบี้ย")) {
        suggestedCategory = "ดอกเบี้ย";
      }

      rows.push({
        sourceRowIndex: i - 1,
        occurredAt,
        description,
        amountSatang,
        direction,
        suggestedTransactionType: suggestedType,
        suggestedCategory,
        rawData: cols,
      });
    }

    return {
      sourceType: "credit_card_statement",
      sourceName: "Generic Credit Card CSV Statement",
      rows,
      period: {
        periodStart: periodStart?.split("T")[0],
        periodEnd: periodEnd?.split("T")[0],
      },
      totalRows: rows.length,
    };
  }

  private getMockResult(): ParseResult {
    const rows: ParsedTransaction[] = [
      {
        sourceRowIndex: 0,
        occurredAt: "2026-07-10T12:00:00Z",
        description: "Payment Received Thank You",
        amountSatang: 150000,
        direction: "credit",
        suggestedTransactionType: "debt_payment",
        suggestedCategory: "อื่น ๆ",
      },
      {
        sourceRowIndex: 1,
        occurredAt: "2026-07-10T14:30:00Z",
        description: "Netflix BKK",
        amountSatang: 41900,
        direction: "debit",
        suggestedTransactionType: "expense",
        suggestedCategory: "อื่น ๆ",
      }
    ];

    return {
      sourceType: "credit_card_statement",
      sourceName: "Mock Credit Card CSV Statement",
      rows,
      period: {
        periodStart: "2026-07-10",
        periodEnd: "2026-07-10",
      },
      totalRows: rows.length,
      accountLastFour: "8888",
    };
  }
}
