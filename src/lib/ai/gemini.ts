import { extractedFinancialDocumentSchema } from "@/lib/ai/schemas";
import { extractionSystemPrompt } from "@/lib/ai/prompts";
import { classifySchemaValidationError, DocumentExtractionError } from "@/lib/ai/extraction-errors";
import { logSafeError } from "@/lib/observability/safe-diagnostics";
import { ZodError } from "zod";

export async function extractFinancialDocument(input: {
  mimeType: string;
  base64: string;
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new DocumentExtractionError("provider_error");
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
    throw new DocumentExtractionError("provider_error");
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new DocumentExtractionError("provider_parse_failed");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text.trim());
  } catch (error) {
    logSafeError("Gemini extraction response parse failed", {
      operation: "gemini.extractFinancialDocument",
      stage: "parse-response",
      provider: "gemini",
      modelName: model,
      errorCode: "provider_parse_failed",
      error,
    });
    throw new DocumentExtractionError("provider_parse_failed", { cause: error });
  }

  try {
    return extractedFinancialDocumentSchema.parse(parsedJson);
  } catch (error) {
    const extractionError =
      error instanceof ZodError ? classifySchemaValidationError(error) : new DocumentExtractionError("schema_validation_failed", { cause: error });
    logSafeError("Gemini extraction schema validation failed", {
      operation: "gemini.extractFinancialDocument",
      stage: "schema-validate",
      provider: "gemini",
      modelName: model,
      errorCode: extractionError.code,
      missingFields: extractionError.missingFields,
      error: extractionError,
    });
    throw extractionError;
  }
}
