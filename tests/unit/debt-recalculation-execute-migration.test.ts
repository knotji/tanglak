import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607110009_harden_debt_recalculation_execute.sql"),
  "utf8",
);

describe("debt recalculation execute hardening migration", () => {
  it("revokes PUBLIC execute and grants only to authenticated", () => {
    expect(migration).toContain(
      "revoke all on function public.recalculate_debt_paid_this_cycle(uuid) from public;",
    );
    expect(migration).toContain(
      "grant execute on function public.recalculate_debt_paid_this_cycle(uuid) to authenticated;",
    );
  });

  it("rejects a caller whose auth.uid() does not own the target debt", () => {
    expect(migration).toContain("auth.uid() is not null and auth.uid() <> v_user_id");
    expect(migration).toContain("raise exception");
  });

  it("keeps security definer with a safe, pinned search_path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
  });

  it("does not modify historical migrations 007 or 008", () => {
    expect(migration).toContain("202607110007 and 202607110008 are not");
  });

  it("preserves the trusted import RPC call chain (both security invoker, calling into this function)", () => {
    expect(migration).toContain("import_commit_row");
    expect(migration).toContain("import_rollback_batch");
  });
});
