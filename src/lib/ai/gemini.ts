import { extractedFinancialDocumentSchema } from "@/lib/ai/schemas";
import { extractionSystemPrompt } from "@/lib/ai/prompts";
import { logSafeError } from "@/lib/observability/safe-diagnostics";

export async function extractFinancialDocument(input: {
  mimeType: string;
  base64: string;
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: "Here is the document to extract." },
            {
              inline_data: {
                mime_type: input.mimeType,
                data: input.base64,
              },
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          { text: extractionSystemPrompt }
        ]
      },
      generationConfig: {
        response_mime_type: "application/json"
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini extraction failed: Status ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no response text");
  }

  // Parse and validate the response
  try {
    const parsedJson = JSON.parse(text.trim());
    return extractedFinancialDocumentSchema.parse(parsedJson);
  } catch (error) {
    logSafeError("Gemini extraction response parse failed", {
      operation: "gemini.extractFinancialDocument",
      stage: "parse-response",
      provider: "gemini",
      modelName: model,
      error,
    });
    throw error;
  }
}
