/**
 * Guard for PostgreSQL undefined-column errors (42703) specifically involving
 * autopilot-related columns. This handles the case where the production database
 * is missing the 202607130001_autopilot_action_audit_log.sql migration.
 */
export function handlePostgrestError(error: { code: string; message: string }): never {
  if (
    error.code === "42703" &&
    (error.message.includes("category_source") || error.message.includes("category_confidence"))
  ) {
    throw new Error(
      "The Autopilot database migration is missing. Please apply migration 202607130001_autopilot_action_audit_log.sql.",
    );
  }

  throw new Error(error.message);
}
