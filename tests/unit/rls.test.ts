import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("RLS migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/202607100001_initial_tanglak_schema.sql"),
    "utf8",
  );

  it("scopes user-owned policies through auth.uid()", () => {
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("for update using (auth.uid() = user_id)");
    expect(migration).toContain("for delete using (auth.uid() = user_id)");
  });

  it("keeps financial document storage private per user folder", () => {
    expect(migration).toContain("bucket_id = 'financial-documents'");
    expect(migration).toContain("auth.uid()::text = (storage.foldername(name))[1]");
  });
});
