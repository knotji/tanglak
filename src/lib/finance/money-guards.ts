import { bahtToSatang } from "@/lib/finance/money";

/**
 * Field classification (see docs/FINANCIAL_VALUE_GUARDS.md for the full
 * audit): "nonnegative" fields may be zero but never negative (e.g. amount
 * due, outstanding balance, minimum payment); "positive" fields must be
 * strictly greater than zero (e.g. a recorded debt payment amount). Never
 * add a third mode that silently repairs a negative value (no Math.abs, no
 * clamping) — invalid input is always rejected, never rewritten.
 */
export type MoneySeverity = "nonnegative" | "positive";

export const MONEY_ERROR_NEGATIVE_TH = "จำนวนเงินต้องไม่ติดลบ";
export const MONEY_ERROR_POSITIVE_TH = "จำนวนเงินต้องมากกว่า 0 บาท";
export const MONEY_ERROR_INVALID_TH = "รูปแบบจำนวนเงินไม่ถูกต้อง";

export type MoneyParseResult = { ok: true; satang?: number } | { ok: false; error: string };

function errorForSeverity(severity: MoneySeverity): string {
  return severity === "positive" ? MONEY_ERROR_POSITIVE_TH : MONEY_ERROR_NEGATIVE_TH;
}

function violatesSeverity(satang: number, severity: MoneySeverity): boolean {
  return severity === "positive" ? satang <= 0 : satang < 0;
}

/**
 * Parses a required monetary form value (baht string, or a raw number as
 * sometimes arrives from JSON payloads) into satang, rejecting blank,
 * malformed, non-finite, and sign-invalid input. Never returns a coerced
 * replacement value — callers must show `error` and let the user correct
 * their own input.
 */
export function parseRequiredMoney(raw: FormDataEntryValue | number | null | undefined, severity: MoneySeverity): MoneyParseResult {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: false, error: MONEY_ERROR_INVALID_TH };
  }
  let satang: number;
  try {
    satang = bahtToSatang(raw as string | number);
  } catch {
    return { ok: false, error: MONEY_ERROR_INVALID_TH };
  }
  if (!Number.isFinite(satang)) {
    return { ok: false, error: MONEY_ERROR_INVALID_TH };
  }
  if (violatesSeverity(satang, severity)) {
    return { ok: false, error: errorForSeverity(severity) };
  }
  return { ok: true, satang };
}

/**
 * Same as `parseRequiredMoney`, but a blank/absent value is valid and
 * resolves to `satang: undefined` rather than an error — for optional
 * monetary fields that should remain null/undefined when not provided.
 */
export function parseOptionalMoney(raw: FormDataEntryValue | number | null | undefined, severity: MoneySeverity): MoneyParseResult {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: true, satang: undefined };
  }
  return parseRequiredMoney(raw, severity);
}

/**
 * Thrown by server-side/repository guards. The message is always the safe
 * Thai copy above — it is safe to surface `error.message` directly to the
 * client without leaking database/Zod/provider internals.
 */
export class FinancialValueError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "FinancialValueError";
    this.field = field;
  }
}

/**
 * Last-line-of-defense guard for repository/server-action code paths.
 * `null`/`undefined` are treated as "not provided" and pass (nullable
 * optional fields stay nullable) — this only rejects a value that is
 * actually present and sign-invalid or non-finite.
 */
export function assertMoneySatang(
  satang: number | null | undefined,
  severity: MoneySeverity,
  fieldName: string,
): void {
  if (satang === null || satang === undefined) return;
  if (!Number.isFinite(satang)) {
    throw new FinancialValueError(fieldName, MONEY_ERROR_INVALID_TH);
  }
  if (violatesSeverity(satang, severity)) {
    throw new FinancialValueError(fieldName, errorForSeverity(severity));
  }
}
