import { extractedFinancialDocumentSchema } from "@/lib/ai/schemas";
import { extractionSystemPrompt } from "@/lib/ai/prompts";
import { classifySchemaValidationError, DocumentExtractionError } from "@/lib/ai/extraction-errors";
import { parseDocumentTimestamp } from "@/lib/ai/timestamp";
import { logSafeError } from "@/lib/observability/safe-diagnostics";
import { ZodError } from "zod";

/**
 * Normalizes `transaction.occurredAt` on the raw Gemini payload before
 * schema validation. Gemini is asked to report the timestamp as printed on
 * the document; the actual date/timezone math is done here, deterministically,
 * rather than trusting the model's own ISO conversion (the source of the
 * original bug — a printed "11 Jul 26 07:26 +0700" round-tripping through
 * the model as a wrong, hallucinated time).
 *
 * A value that can't be confidently parsed is stripped (never replaced with
 * the current date/time) so the existing required-field pipeline
 * (classifySchemaValidationError) surfaces it as needing review, exactly as
 * it already does for any other missing required financial field.
 */
function normalizeParsedTimestamp(parsedJson: unknown): unknown {
  if (typeof parsedJson !== "object" || parsedJson === null) return parsedJson;
  const root = parsedJson as { transaction?: unknown };
  if (typeof root.transaction !== "object" || root.transaction === null) return parsedJson;

  const transaction = root.transaction as { occurredAt?: unknown };
  if (!("occurredAt" in transaction)) return parsedJson;

  const result = parseDocumentTimestamp(transaction.occurredAt);
  if (result.state === "extracted" || result.state === "inferred") {
    transaction.occurredAt = result.iso;
  } else {
    delete transaction.occurredAt;
  }
  return parsedJson;
}

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
    return extractedFinancialDocumentSchema.parse(normalizeParsedTimestamp(parsedJson));
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
