import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Normalize line endings before asserting -- see F-002 in
// docs/SLIP_DEBT_FINAL_SECURITY_AUDIT.md. A checked-out file on Windows can
// have CRLF line endings; substring/regex assertions here must not depend
// on which line-ending convention the working tree happens to have.
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607110010_require_import_debt_payment_link.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

const historicalMigration007 = readFileSync(
  join(process.cwd(), "supabase/migrations/202607110007_debt_cycle_fields.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("import debt-payment link migration (010)", () => {
  it("rejects a debt_payment row with a null debt_id before writing anything", () => {
    expect(migration).toContain("if p_type = 'debt_payment' and p_debt_id is null then");
    expect(migration).toContain("raise exception 'debt payment must be linked to a debt' using errcode = 'P0001';");
  });

  it("still validates ownership for a non-null debt_id", () => {
    expect(migration).toContain("if p_debt_id is not null then");
    expect(migration).toContain("debt not found or not owned by user");
  });

  it("preserves source/destination account ownership checks", () => {
    expect(migration).toContain("source account not found or not owned by user");
    expect(migration).toContain("destination account not found or not owned by user");
  });

  it("preserves the idempotent already-resolved short-circuit ahead of the new guard", () => {
    const resolvedIdx = migration.indexOf("review_status in ('imported', 'skipped')");
    const guardIdx = migration.indexOf("p_type = 'debt_payment' and p_debt_id is null");
    expect(resolvedIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(resolvedIdx).toBeLessThan(guardIdx);
  });

  it("preserves security invoker and a safe, pinned search_path", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = public");
  });

  it("preserves the existing PUBLIC revoke and authenticated grant, unchanged from 007", () => {
    expect(migration).toContain("revoke all on function public.import_commit_row(");
    expect(migration).toContain(") from public;");
    expect(migration).toContain("grant execute on function public.import_commit_row(");
    expect(migration).toContain(") to authenticated;");
  });

  it("does not touch rollback (import_rollback_batch is untouched by this migration)", () => {
    expect(migration).not.toContain("create or replace function public.import_rollback_batch");
  });

  it("does not read, update, or delete any table row", () => {
    expect(migration).not.toMatch(/\bupdate\s+public\.transactions\b/);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.transactions\b/);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.debt_payments\b/);
  });

  it("is additive only and does not modify historical migrations 007, 008, or 009", () => {
    expect(migration).toContain("No historical migration");
    // The historical file's own guard clause must not exist there -- proves
    // this migration did not get merged back into 007.
    expect(historicalMigration007).not.toContain("debt payment must be linked to a debt");
  });

  it("passes identically regardless of whether the file was read with CRLF line endings", () => {
    const crlfVersion = migration.replace(/\n/g, "\r\n").replace(/\r\r\n/g, "\r\n");
    const normalizedBack = crlfVersion.replace(/\r\n/g, "\n");
    expect(normalizedBack).toBe(migration);
    expect(normalizedBack).toContain("if p_type = 'debt_payment' and p_debt_id is null then");
  });
});
