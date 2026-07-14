import { describe, it, expect } from "vitest";
import { handlePostgrestError } from "@/lib/supabase/error-guards";

describe("handlePostgrestError", () => {
  it("detects missing category_source and returns actionable message", () => {
    const error = {
      code: "42703",
      message: 'column "category_source" of relation "transactions" does not exist',
    };

    expect(() => handlePostgrestError(error)).toThrow(
      "The Autopilot database migration is missing. Please apply migration 202607130001_autopilot_action_audit_log.sql.",
    );
  });

  it("detects missing category_confidence and returns actionable message", () => {
    const error = {
      code: "42703",
      message: 'column "category_confidence" of relation "transactions" does not exist',
    };

    expect(() => handlePostgrestError(error)).toThrow(
      "The Autopilot database migration is missing. Please apply migration 202607130001_autopilot_action_audit_log.sql.",
    );
  });

  it("does not rewrite unrelated 42703 errors", () => {
    const error = {
      code: "42703",
      message: 'column "unknown_column" of relation "transactions" does not exist',
    };

    expect(() => handlePostgrestError(error)).toThrow('column "unknown_column" of relation "transactions" does not exist');
  });

  it("does not rewrite unrelated database errors (e.g., 23505 unique violation)", () => {
    const error = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "transactions_pkey"',
    };

    expect(() => handlePostgrestError(error)).toThrow('duplicate key value violates unique constraint "transactions_pkey"');
  });
});
