/**
 * Guard for PostgreSQL undefined-column errors (42703) specifically involving
 * autopilot-related columns on the transactions table. This handles the case
 * where the production database is missing the
 * 202607130001_autopilot_action_audit_log.sql migration.
 */
export function handlePostgrestError(error: { code: string; message: string }): never {
  const isUndefinedColumn = error.code === "42703";
  const message = error.message || "";

  // PostgREST/PostgreSQL error format for missing columns usually looks like:
  // "column \"category_source\" of relation \"transactions\" does not exist"
  // We check for both the column name AND the specific relation name.
  const isTransactionTable = message.includes('"transactions"');
  const isAutopilotColumn =
    message.includes("category_source") || message.includes("category_confidence");

  if (isUndefinedColumn && isTransactionTable && isAutopilotColumn) {
    throw new Error(
      "The Autopilot database migration is missing. Please apply migration 202607130001_autopilot_action_audit_log.sql.",
    );
  }

  throw new Error(message);
}
