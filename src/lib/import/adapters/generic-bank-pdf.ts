import type { ImportParser, ParseResult, ParsedTransaction } from "../types";
import { isMockAuthEnabled } from "@/lib/auth/session";

export class GenericBankPDFParser implements ImportParser {
  name = "generic-bank-pdf";
  version = "1.0.0";

  async canParse(fileExtension: string, mimeType: string, _firstBytes: string): Promise<boolean> {
    return fileExtension === "pdf" || mimeType === "application/pdf";
  }

  async parse(fileData: Buffer | string): Promise<ParseResult> {
    // 1. Detect password protection
    const bufferText = typeof fileData === "string"
      ? fileData
      : fileData.toString("utf8", 0, Math.min(fileData.length, 60000));
    
    if (bufferText.includes("/Encrypt")) {
      throw new Error("Password-protected PDF files are not supported");
    }

    if (isMockAuthEnabled()) {
      return this.getMockResult();
    }

    // 2. Call Gemini for parsing
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const base64 = typeof fileData === "string"
      ? Buffer.from(fileData).toString("base64")
      : fileData.toString("base64");

    const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const systemPrompt = `You are a professional bank statement parser. Extract all transaction items from the uploaded statement PDF/image document. 
Return ONLY a strict JSON object with: 
- sourceType: "bank_statement"
- sourceName: (e.g. "KBank Statement")
- accountLastFour: string (4 digits)
- periodStart: string (YYYY-MM-DD)
- periodEnd: string (YYYY-MM-DD)
- rows: array of transaction rows. 

Each row in the rows array must have:
- sourceRowIndex: number (0-indexed)
- occurredAt: string (ISO 8601 format e.g. YYYY-MM-DDTHH:mm:ssZ, time is optional)
- description: string
- amountSatang: number (positive integer in satang)
- direction: string ("credit" for deposits, "debit" for withdrawals)
- runningBalanceSatang: number (optional, positive integer in satang)
- referenceNumber: string (optional)

Do not add markdown formatting code block backticks. Return raw JSON text only.`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Extract the transactions from this bank statement PDF." },
              {
                inline_data: {
                  mime_type: "application/pdf",
                  data: base64,
                },
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          response_mime_type: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini statement parsing failed: Status ${response.status}. ${body}`);
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini returned no statement parse content");
    }

    try {
      const result = JSON.parse(text.trim()) as ParseResult;
      return {
        sourceType: result.sourceType || "bank_statement",
        sourceName: result.sourceName || "PDF Statement",
        rows: result.rows || [],
        period: result.period,
        accountLastFour: result.accountLastFour,
        totalRows: (result.rows || []).length,
      };
    } catch (e) {
      console.error("Failed to parse Gemini statement JSON:", text, e);
      throw new Error("Malformed JSON statement response from AI model");
    }
  }

  private getMockResult(): ParseResult {
    const rows: ParsedTransaction[] = [
      {
        sourceRowIndex: 0,
        occurredAt: "2026-07-10T11:00:00Z",
        description: "Deposit Transfer KBank BKK",
        amountSatang: 50000,
        direction: "credit",
        runningBalanceSatang: 250000,
        referenceNumber: "TXN_BE_1",
        suggestedTransactionType: "income",
        suggestedCategory: "อื่น ๆ",
      },
      {
        sourceRowIndex: 1,
        occurredAt: "2026-07-10T12:00:00Z",
        description: "KTC Test Credit Card Payment",
        amountSatang: 150000,
        direction: "debit",
        runningBalanceSatang: 100000,
        referenceNumber: "TXN_BE_2",
        suggestedTransactionType: "debt_payment",
        suggestedCategory: "อื่น ๆ",
      }
    ];

    return {
      sourceType: "bank_statement",
      sourceName: "Mock PDF Statement",
      rows,
      period: {
        periodStart: "2026-07-10",
        periodEnd: "2026-07-10",
      },
      totalRows: rows.length,
      accountLastFour: "1234",
    };
  }
}
