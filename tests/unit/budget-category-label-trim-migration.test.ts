import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202607110005_budget_category_label_trim_uniqueness.sql",
);

describe("budget category label trim-uniqueness migration", () => {
  it("exists as a new migration file", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("drops the old raw-text unique index before recreating it", () => {
    expect(migration).toMatch(/drop index if exists public\.uq_budget_categories_user_month_label/i);
  });

  it("recreates the unique index against trim(label), not the raw column", () => {
    expect(migration).toMatch(/create unique index if not exists uq_budget_categories_user_month_label/i);
    expect(migration).toContain("on public.budget_categories(user_id, monthly_budget_id, trim(label))");
  });

  it("does not modify migration 202607110004 in place", () => {
    const priorMigrationPath = join(
      process.cwd(),
      "supabase/migrations/202607110004_monthly_budget_engine.sql",
    );
    // Normalize line endings before comparing -- git on Windows may check
    // this file out with CRLF, which must not be mistaken for a content
    // change to the historical migration.
    const priorMigration = readFileSync(priorMigrationPath, "utf8").replace(/\r\n/g, "\n");
    // The prior migration's index definition must remain exactly what it
    // was when committed -- this new migration supersedes it via a
    // separate drop+recreate, never by editing the file that created it.
    expect(priorMigration).toContain(
      "create unique index if not exists uq_budget_categories_user_month_label\n  on public.budget_categories(user_id, monthly_budget_id, label);",
    );
  });

  it("never rewrites row data -- no update/delete statement", () => {
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\./i);
  });
});
