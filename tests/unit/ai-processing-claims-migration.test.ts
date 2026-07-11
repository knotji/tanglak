import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202607110003_ai_processing_claims.sql",
);
const initialSchemaPath = join(
  process.cwd(),
  "supabase/migrations/202607100001_initial_tanglak_schema.sql",
);

describe("AI processing claims migration", () => {
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
  const initialSchema = existsSync(initialSchemaPath) ? readFileSync(initialSchemaPath, "utf8") : "";

  it("exists as a forward migration without editing the initial documents table", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(initialSchema).toContain("status document_status not null default 'uploaded'");
    expect(initialSchema).toContain("create type public.document_status as enum ('uploaded', 'processing', 'needs_review', 'confirmed', 'failed')");
  });

  it("adds every new durable processing status to the document_status enum", () => {
    for (const status of ["review_ready", "failed_retryable", "failed_permanent"]) {
      expect(migration).toContain(`alter type public.document_status add value if not exists '${status}'`);
    }
  });

  it("keeps the status column not-null with the existing uploaded default", () => {
    expect(migration).not.toMatch(/alter\s+table\s+public\.documents\s+alter\s+column\s+status/i);
    expect(initialSchema).toContain("status document_status not null default 'uploaded'");
  });

  it("adds a nullable timestamp lease and an index for stale processing lookup", () => {
    expect(migration).toContain("add column if not exists processing_started_at timestamptz");
    expect(migration).toContain("documents_processing_claim_idx");
    expect(migration).toContain("where status = 'processing'");
  });

  it("documents deployment, rollback, and stuck-document recovery", () => {
    expect(migration).toMatch(/deploy this migration before application code/i);
    expect(migration).toMatch(/rollback/i);
    expect(migration).toMatch(/operational recovery query/i);
    expect(migration).toContain("processing_started_at < now() - interval '2 minutes'");
  });

  it("does not rewrite or delete existing document rows", () => {
    expect(migration).not.toMatch(/\bupdate\s+public\.documents\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.documents\b/i);
  });
});
