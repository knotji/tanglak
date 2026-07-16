type SafeDiagnosticInput = {
  operation?: unknown;
  stage?: unknown;
  requestId?: unknown;
  batchId?: unknown;
  documentId?: unknown;
  error?: unknown;
  errorCode?: unknown;
  provider?: unknown;
  modelName?: unknown;
  durationMs?: unknown;
  attemptCount?: unknown;
  missingFields?: unknown;
  fallback?: unknown;
};

export type SafeDiagnostic = Record<string, string | number>;

function safeString(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (error && typeof error === "object" && "name" in error) {
    return safeString((error as { name?: unknown }).name) ?? "Error";
  }
  return typeof error;
}

function errorCode(inputCode: unknown, error: unknown): string | undefined {
  const explicit = safeString(inputCode, 80);
  if (explicit) return explicit;
  if (error && typeof error === "object" && "code" in error) {
    return safeString((error as { code?: unknown }).code, 80);
  }
  return undefined;
}

function sanitizedDevelopmentMessage(error: unknown): string | undefined {
  if (process.env.NODE_ENV !== "development") return undefined;
  if (!(error instanceof Error)) return undefined;
  return safeString(error.message, 180);
}

function safeStringList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const safeItems = value
    .map((item) => safeString(item, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
  return safeItems.length > 0 ? safeItems.join(",") : undefined;
}

export function createSafeDiagnostic(input: SafeDiagnosticInput): SafeDiagnostic {
  const diagnostic: SafeDiagnostic = {};
  const operation = safeString(input.operation);
  const stage = safeString(input.stage);
  const requestId = safeString(input.requestId);
  const batchId = safeString(input.batchId);
  const documentId = safeString(input.documentId);
  const provider = safeString(input.provider, 80);
  const modelName = safeString(input.modelName, 80);
  const durationMs = safeNumber(input.durationMs);
  const attemptCount = safeNumber(input.attemptCount);
  const missingFields = safeStringList(input.missingFields);
  const fallback = safeString(input.fallback, 80);
  const code = errorCode(input.errorCode, input.error);
  const devMessage = sanitizedDevelopmentMessage(input.error);

  if (operation) diagnostic.operation = operation;
  if (stage) diagnostic.stage = stage;
  if (requestId) diagnostic.requestId = requestId;
  if (batchId) diagnostic.batchId = batchId;
  if (documentId) diagnostic.documentId = documentId;
  if (provider) diagnostic.provider = provider;
  if (modelName) diagnostic.modelName = modelName;
  if (durationMs !== undefined) diagnostic.durationMs = durationMs;
  if (attemptCount !== undefined) diagnostic.attemptCount = attemptCount;
  if (missingFields) diagnostic.missingFields = missingFields;
  if (fallback) diagnostic.fallback = fallback;
  if (input.error !== undefined) diagnostic.errorName = errorName(input.error);
  if (code) diagnostic.errorCode = code;
  if (devMessage) diagnostic.errorMessage = devMessage;

  return diagnostic;
}

export function logSafeError(message: string, input: SafeDiagnosticInput) {
  console.error(message, createSafeDiagnostic(input));
}
