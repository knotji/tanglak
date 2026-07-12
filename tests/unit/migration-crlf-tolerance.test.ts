import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression coverage for F-002 in docs/SLIP_DEBT_FINAL_SECURITY_AUDIT.md:
// a migration assertion that matches a literal multi-line substring must
// not be sensitive to the line-ending convention the file happens to be
// checked out with. This proves the fix generalizes -- normalizing to LF
// before asserting yields the same result whether the source content uses
// LF or CRLF line endings.

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202607110008_debt_minimum_not_above_outstanding.sql",
);

const rawLf = readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
const rawCrlf = rawLf.replace(/\n/g, "\r\n");

const constraintBodySubstring =
  "minimum_payment_satang is null\n        or outstanding_balance_satang is null\n        or minimum_payment_satang <= outstanding_balance_satang";

describe("migration assertions are line-ending agnostic", () => {
  it("matches the constraint body when the source uses LF line endings", () => {
    const normalized = rawLf.replace(/\r\n/g, "\n");
    expect(normalized).toContain(constraintBodySubstring);
  });

  it("matches the same constraint body when the source uses CRLF line endings", () => {
    expect(rawCrlf).not.toBe(rawLf); // sanity check the fixture actually differs
    const normalized = rawCrlf.replace(/\r\n/g, "\n");
    expect(normalized).toContain(constraintBodySubstring);
  });

  it("produces byte-identical normalized content from either line-ending form", () => {
    const normalizedFromLf = rawLf.replace(/\r\n/g, "\n");
    const normalizedFromCrlf = rawCrlf.replace(/\r\n/g, "\n");
    expect(normalizedFromCrlf).toBe(normalizedFromLf);
  });

  it("the semantic assertion set (constraint name, NOT VALID, guard) is identical under both line endings", () => {
    for (const raw of [rawLf, rawCrlf]) {
      const normalized = raw.replace(/\r\n/g, "\n");
      expect(normalized).toContain("debts_minimum_not_above_outstanding");
      expect(normalized).toContain("not valid");
      expect(normalized).toContain("select 1 from pg_constraint");
    }
  });
});
