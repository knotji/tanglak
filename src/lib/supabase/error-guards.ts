/**
 * Guard for PostgreSQL undefined-column errors (42703) or PostgREST schema cache
 * errors (PGRST204) specifically involving autopilot-related columns on the
 * transactions table. This handles the case where the production database is
 * missing the 202607130001_autopilot_action_audit_log.sql migration.
 */
export function handlePostgrestError(error: { code: string; message: string }): never {
  const isMissingColumnError = error.code === "42703" || error.code === "PGRST204";
  const message = error.message || "";

  // PostgreSQL error format: "column \"category_source\" of relation \"transactions\" does not exist"
  // PostgREST PGRST204 format: "Could not find column \"category_source\" in schema cache for relation \"transactions\"" (or similar)
  // We check for both the column name AND the specific relation name.
  const isTransactionTable = message.includes('"transactions"');
  const isAutopilotColumn =
    message.includes("category_source") || message.includes("category_confidence");

  const errMessage = (isMissingColumnError && isTransactionTable && isAutopilotColumn)
    ? "The Autopilot database migration is missing. Please apply migration 202607130001_autopilot_action_audit_log.sql."
    : message;

  const err = new Error(errMessage);
  err.name = "DatabaseError";
  Object.defineProperty(err, "code", {
    value: error.code,
    configurable: true,
    enumerable: true,
    writable: true,
  });
  throw err;
}
