import { z } from "zod";
import { isMockAuthEnabled } from "@/lib/auth/session";
import type { LayoutColumnRole } from "./types";

const PROMPT_VERSION = "pdf-header-assist-v1";

const assistSchema = z.object({
  columns: z.array(
    z.object({
      index: z.number().int().min(0),
      role: z.enum([
        "date",
        "posted_date",
        "time",
        "description",
        "debit",
        "credit",
        "amount",
        "balance",
        "reference",
        "ignore",
      ]),
    }),
  ),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
});

export type GeminiHeaderAssistResult = z.infer<typeof assistSchema>;

export interface GeminiAssistOutcome {
  ok: boolean;
  result?: GeminiHeaderAssistResult;
  modelName: string;
  promptVersion: string;
  rawResponse?: unknown;
  error?: string;
}

/**
 * Limited assist: given a header line that our deterministic detector could
 * not classify confidently, ask Gemini which column index maps to which
 * semantic role. Gemini never sees full statement rows and never invents
 * transactions — it only proposes a column mapping, which the caller still
 * runs back through the deterministic parser.
 */
export async function assistHeaderMapping(
  headerText: string,
  sampleRowTexts: string[],
): Promise<GeminiAssistOutcome> {
  const modelName = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

  if (isMockAuthEnabled()) {
    return mockAssist(headerText, modelName);
  }

  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, modelName, promptVersion: PROMPT_VERSION, error: "GEMINI_API_KEY is not configured" };
  }

  const systemPrompt = `You map a single bank-statement table header row to column roles.
Return strict JSON: { "columns": [{"index": number, "role": string}], "confidence": number (0-1), "warnings": string[] }.
Valid roles: date, posted_date, time, description, debit, credit, amount, balance, reference, ignore.
Do not invent columns that are not in the input. Do not return transaction rows or totals.`;

  const userPrompt = `Header line (tokens separated by 2+ spaces): ${headerText}\nSample data lines:\n${sampleRowTexts.slice(0, 3).join("\n")}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { response_mime_type: "application/json" },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, modelName, promptVersion: PROMPT_VERSION, error: `status ${response.status}: ${body}` };
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { ok: false, modelName, promptVersion: PROMPT_VERSION, error: "empty response" };
    }

    const parsedJson = JSON.parse(text.trim());
    const result = assistSchema.parse(parsedJson);
    return { ok: true, result, modelName, promptVersion: PROMPT_VERSION, rawResponse: parsedJson };
  } catch (error) {
    return {
      ok: false,
      modelName,
      promptVersion: PROMPT_VERSION,
      error: error instanceof Error ? error.message : "unknown gemini-assist error",
    };
  }
}

function mockAssist(headerText: string, modelName: string): GeminiAssistOutcome {
  const tokens = headerText.split(/\s{2,}/).map((t) => t.trim()).filter(Boolean);
  const columns = tokens.map((token, index) => ({ index, role: guessRole(token) }));
  return {
    ok: true,
    modelName,
    promptVersion: PROMPT_VERSION,
    result: { columns, confidence: 0.55, warnings: ["ผลลัพธ์จำลองสำหรับการทดสอบ"] },
  };
}

function guessRole(token: string): LayoutColumnRole {
  const clean = token.toLowerCase();
  if (/date|วันที่/.test(clean)) return "date";
  if (/debit|withdraw|ถอน/.test(clean)) return "debit";
  if (/credit|deposit|ฝาก/.test(clean)) return "credit";
  if (/balance|คงเหลือ/.test(clean)) return "balance";
  if (/amount|จำนวน/.test(clean)) return "amount";
  if (/desc|รายการ/.test(clean)) return "description";
  return "ignore";
}
