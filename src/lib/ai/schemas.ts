import { z } from "zod";

export const transactionTypeSchema = z.enum([
  "income",
  "expense",
  "debt_payment",
  "transfer",
  "refund",
]);

export const debtTypeSchema = z.enum([
  "credit_card",
  "personal_loan",
  "installment",
  "mortgage",
  "auto_loan",
  "buy_now_pay_later",
  "informal_loan",
  "other",
]);

export const extractedFinancialDocumentSchema = z.object({
  documentType: z.enum([
    "salary_slip",
    "transfer_slip",
    "receipt",
    "delivery_receipt",
    "debt_statement",
    "loan_schedule",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
  transaction: z
    .object({
      type: transactionTypeSchema.optional(),
      amount: z.number().nonnegative().optional(),
      currency: z.string().optional(),
      occurredAt: z.string().optional(),
      merchant: z.string().optional(),
      category: z.string().optional(),
      paymentMethod: z.string().optional(),
      referenceNumber: z.string().optional(),
      accountLastFour: z.string().optional(),
      destinationAccountLastFour: z.string().optional(),
      destinationName: z.string().optional(),
      bank: z.string().optional(),
      possibleDebtPayment: z.boolean().optional(),
      possibleOwnAccountTransfer: z.boolean().optional(),
      note: z.string().optional(),
    })
    .optional(),
  salary: z
    .object({
      employer: z.string().optional(),
      payPeriod: z.string().optional(),
      grossIncome: z.number().nonnegative().optional(),
      netIncome: z.number().nonnegative().optional(),
      tax: z.number().nonnegative().optional(),
      socialSecurity: z.number().nonnegative().optional(),
      deductions: z
        .array(z.object({ label: z.string(), amount: z.number().nonnegative() }))
        .optional(),
    })
    .optional(),
  receipt: z
    .object({
      subtotal: z.number().nonnegative().optional(),
      deliveryFee: z.number().nonnegative().optional(),
      serviceFee: z.number().nonnegative().optional(),
      discount: z.number().nonnegative().optional(),
      totalPaid: z.number().nonnegative().optional(),
      items: z
        .array(
          z.object({
            name: z.string(),
            quantity: z.number().positive().optional(),
            amount: z.number().nonnegative().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  debt: z
    .object({
      creditor: z.string().optional(),
      debtName: z.string().optional(),
      debtType: debtTypeSchema.optional(),
      outstandingBalance: z.number().nonnegative().optional(),
      statementBalance: z.number().nonnegative().optional(),
      amountDue: z.number().nonnegative().optional(),
      minimumPayment: z.number().nonnegative().optional(),
      dueDate: z.string().optional(),
      interestRateAnnual: z.number().nonnegative().optional(),
      remainingInstallments: z.number().int().nonnegative().optional(),
      accountLastFour: z.string().optional(),
    })
    .optional(),
  warnings: z.array(z.string()),
  unclearFields: z.array(z.string()),
  requiresReview: z.literal(true),
});

export type ExtractedFinancialDocument = z.infer<
  typeof extractedFinancialDocumentSchema
>;
