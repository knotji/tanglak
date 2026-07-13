/**
 * Structured, validated action proposals -- the only shape an AI-derived
 * (or rule-derived) suggestion is allowed to take before it can reach the
 * policy engine or executor. AI output (Gemini's extraction result) is
 * never passed to the database directly; it must first be normalized into
 * one of these proposals and pass `parseAutopilotActionProposal` below.
 *
 * No `as` cast is used anywhere in this module to force a value through --
 * every field is checked by a real zod rule, and the discriminated union
 * on `type` means an unrecognized/unsupported action type fails parsing
 * outright rather than falling through to a default shape.
 */

import { z } from "zod";
import { transactionTypeSchema } from "@/lib/ai/schemas";
import { getCategoryById } from "@/lib/finance/categories";
import type { AutopilotActionSource, AutopilotActionType } from "./autopilot-types";

export const ALLOWLISTED_ACTION_TYPES: readonly AutopilotActionType[] = [
  "create_transaction",
  "update_transaction_category",
  "mark_internal_transfer",
  "ignore_duplicate_candidate",
] as const;

const actionSourceSchema = z.enum(["slip_import", "csv_import", "manual_text", "system_rule", "user_correction"]) satisfies z.ZodType<AutopilotActionSource>;

/**
 * A category id must resolve to an active entry in the canonical catalog.
 * This is the schema-level enforcement of "AI must select only from
 * active canonical categories" -- refine, not just z.string(), so an
 * invented/legacy/inactive id fails validation instead of silently
 * passing through as a plain string.
 */
const canonicalCategoryIdSchema = z.string().min(1).refine(
  (id) => {
    const category = getCategoryById(id);
    return Boolean(category?.active);
  },
  { message: "Category id is not a recognized, active canonical category" },
);

/** Non-negative integer satang -- amounts are always integers in this app, never floats. */
const satangSchema = z.number().int().finite();

const positiveSatangSchema = satangSchema.refine((value) => value > 0, {
  message: "Amount must be a positive integer number of satang",
});

const nonNegativeSatangSchema = satangSchema.refine((value) => value >= 0, {
  message: "Amount must be a non-negative integer number of satang",
});

/** `YYYY-MM-DDTHH:mm:ss+07:00`-shaped Bangkok-offset instant -- never a bare/ambiguous string. */
const bangkokInstantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/, "occurredAt must be a Bangkok-offset ISO instant (+07:00)");

const sourceMetadataSchema = z
  .object({
    documentId: z.string().min(1).optional(),
    slipReferenceNumber: z.string().optional(),
    merchant: z.string().optional(),
    rawCategoryLabel: z.string().optional(),
  })
  .strict();

/**
 * create_transaction -- the only action Phase 1 executes end-to-end from
 * Slip Import. amountSatang is enforced positive for expense/income/
 * debt_payment/refund and allowed zero only for transfer, matching the
 * repository's own assertMoneySatang rule (debt_payment strictly
 * positive elsewhere too).
 */
const createTransactionPayloadSchema = z
  .object({
    transactionType: transactionTypeSchema,
    amountSatang: satangSchema,
    occurredAt: bangkokInstantSchema,
    merchant: z.string().min(1).max(200).optional(),
    categoryId: canonicalCategoryIdSchema,
    note: z.string().max(2000).optional(),
    debtId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (payload.transactionType === "transfer") {
      if (!nonNegativeSatangSchema.safeParse(payload.amountSatang).success) {
        ctx.addIssue({ code: "custom", message: "Transfer amount must be non-negative", path: ["amountSatang"] });
      }
    } else if (!positiveSatangSchema.safeParse(payload.amountSatang).success) {
      ctx.addIssue({ code: "custom", message: "Transaction amount must be a positive number of satang", path: ["amountSatang"] });
    }

    if (payload.transactionType === "debt_payment" && !payload.debtId) {
      ctx.addIssue({ code: "custom", message: "debt_payment requires a debtId", path: ["debtId"] });
    }

    // An internal transfer must never be proposed under a category that
    // would count it toward spending totals -- the "transfers" category
    // is the only category id transfer-typed proposals may use.
    if (payload.transactionType === "transfer" && payload.categoryId !== "transfers") {
      ctx.addIssue({
        code: "custom",
        message: "A transfer transaction must use the 'transfers' category, never an expense category",
        path: ["categoryId"],
      });
    }
  });

const updateTransactionCategoryPayloadSchema = z
  .object({
    transactionId: z.string().min(1),
    categoryId: canonicalCategoryIdSchema,
  })
  .strict();

const markInternalTransferPayloadSchema = z
  .object({
    transactionId: z.string().min(1),
  })
  .strict();

const ignoreDuplicateCandidatePayloadSchema = z
  .object({
    candidateTransactionId: z.string().min(1),
    incomingReferenceHint: z.string().optional(),
  })
  .strict();

const baseProposalFields = {
  source: actionSourceSchema,
  sourceMetadata: sourceMetadataSchema.optional(),
  extractionConfidence: z.number().min(0).max(1).optional(),
  categoryConfidence: z.number().min(0).max(1).optional(),
};

export const autopilotActionProposalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_transaction"), payload: createTransactionPayloadSchema, ...baseProposalFields }).strict(),
  z.object({ type: z.literal("update_transaction_category"), payload: updateTransactionCategoryPayloadSchema, ...baseProposalFields }).strict(),
  z.object({ type: z.literal("mark_internal_transfer"), payload: markInternalTransferPayloadSchema, ...baseProposalFields }).strict(),
  z.object({ type: z.literal("ignore_duplicate_candidate"), payload: ignoreDuplicateCandidatePayloadSchema, ...baseProposalFields }).strict(),
]);

export type AutopilotActionProposal = z.infer<typeof autopilotActionProposalSchema>;
export type CreateTransactionPayload = z.infer<typeof createTransactionPayloadSchema>;

export type AutopilotSchemaResult =
  | { ok: true; proposal: AutopilotActionProposal }
  | { ok: false; errors: string[] };

/**
 * The single entry point for turning an untrusted candidate object (built
 * from AI extraction output, never the raw Gemini JSON itself) into a
 * validated AutopilotActionProposal. Never bypassed with an `as` cast --
 * callers that need the parsed value must go through this function.
 */
export function parseAutopilotActionProposal(candidate: unknown): AutopilotSchemaResult {
  if (typeof candidate === "object" && candidate !== null && "type" in candidate) {
    const type = (candidate as { type: unknown }).type;
    if (typeof type === "string" && !ALLOWLISTED_ACTION_TYPES.includes(type as AutopilotActionType)) {
      return { ok: false, errors: [`Action type "${type}" is not in the allowlist`] };
    }
  }

  const result = autopilotActionProposalSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  return { ok: true, proposal: result.data };
}
