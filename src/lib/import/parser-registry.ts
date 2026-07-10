import type { ImportParser, ParseResult, ParseStatementFileContext } from "./types";
import { GenericBankCSVParser } from "./adapters/generic-bank-csv";
import { GenericCreditCardCSVParser } from "./adapters/generic-credit-card-csv";
import { GenericBankPDFParser } from "./adapters/generic-bank-pdf";
import { GenericCreditCardPDFParser } from "./adapters/generic-credit-card-pdf";
import { validateRunningBalance } from "./validators";
import { computeRowFingerprint } from "./row-fingerprint";
import { listRecentConfirmedTransactions } from "../data/finance-repository";
import type { ImportRow, ImportRowDecision, ImportRowStatus } from "@/types/domain";

const PARSERS: ImportParser[] = [
  new GenericCreditCardCSVParser(),
  new GenericBankCSVParser(),
  new GenericCreditCardPDFParser(),
  new GenericBankPDFParser(),
];

export async function parseStatement(
  filename: string,
  mimeType: string,
  fileData: Buffer,
  context?: ParseStatementFileContext,
): Promise<ParseResult> {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  const firstBytes = fileData.toString("utf8", 0, Math.min(fileData.length, 1000));

  let selectedParser: ImportParser | null = null;
  for (const parser of PARSERS) {
    if (await parser.canParse(extension, mimeType, firstBytes)) {
      selectedParser = parser;
      break;
    }
  }

  if (!selectedParser) {
    throw new Error("Unsupported statement file format or layout");
  }

  return await selectedParser.parse(fileData, context);
}

export async function processStagingRows(
  userId: string,
  batchId: string,
  parseResult: ParseResult,
): Promise<Omit<ImportRow, "id" | "createdAt" | "updatedAt">[]> {
  // Retrieve recent transactions for duplicate matching
  const existingTxs = await listRecentConfirmedTransactions(userId);

  const stagingRows: Omit<ImportRow, "id" | "createdAt" | "updatedAt">[] = [];

  // Parse running balance checks
  const balanceResult = validateRunningBalance(parseResult.rows);

  for (const parsed of parseResult.rows) {
    const rawData = parsed.rawData;

    // Suggest transaction type
    let suggestedTransactionType = parsed.suggestedTransactionType;
    if (!suggestedTransactionType) {
      suggestedTransactionType = parsed.direction === "credit" ? "income" : "expense";
    }

    // Suggest category
    let suggestedCategory = parsed.suggestedCategory;
    if (!suggestedCategory) {
      suggestedCategory = suggestedTransactionType === "income" ? "รายได้" : "อื่น ๆ";
    }

    // Scoring duplicates
    let duplicateScore = 0;
    let duplicateTransactionId: string | undefined;
    let reviewStatus: ImportRowStatus = "ready";
    let importDecision: ImportRowDecision = "unresolved"; // default unresolved so user verifies

    for (const tx of existingTxs) {
      let score = 0;

      // Exact reference number match
      if (parsed.referenceNumber && tx.referenceNumber === parsed.referenceNumber) {
        score = 100;
      } else {
        const timeDiffMs = Math.abs(new Date(tx.occurredAt).getTime() - new Date(parsed.occurredAt).getTime());
        const amountMatch = tx.amountSatang === parsed.amountSatang;

        if (amountMatch) {
          if (timeDiffMs === 0) {
            score = 90;
          } else if (timeDiffMs <= 24 * 60 * 60 * 1000) {
            score = 80;
          } else if (tx.merchant && parsed.merchant && tx.merchant.toLowerCase() === parsed.merchant.toLowerCase()) {
            score = 75;
          } else {
            score = 40;
          }
        }
      }

      if (score > duplicateScore) {
        duplicateScore = score;
        duplicateTransactionId = tx.id;
      }
    }

    // Map duplicate score to status
    if (duplicateScore >= 90) {
      reviewStatus = "possible_duplicate";
      importDecision = "skip"; // auto-suggest skipping exact/likely duplicates
    } else if (duplicateScore >= 40) {
      reviewStatus = "possible_duplicate";
      importDecision = "unresolved";
    } else {
      reviewStatus = "ready";
      importDecision = "import"; // high confidence
    }

    // Detect potential transfers (within batch)
    // opposite directions, same amount, close timestamps (within 1 hour)
    let isPossibleTransfer = false;
    for (const other of parseResult.rows) {
      if (other.sourceRowIndex !== parsed.sourceRowIndex && other.amountSatang === parsed.amountSatang) {
        const otherDirection = other.direction;
        const currentDirection = parsed.direction;
        if (
          (currentDirection === "credit" && otherDirection === "debit") ||
          (currentDirection === "debit" && otherDirection === "credit")
        ) {
          const diffMs = Math.abs(new Date(other.occurredAt).getTime() - new Date(parsed.occurredAt).getTime());
          if (diffMs <= 60 * 60 * 1000) {
            isPossibleTransfer = true;
            break;
          }
        }
      }
    }

    if (isPossibleTransfer && reviewStatus === "ready") {
      reviewStatus = "possible_transfer";
      suggestedTransactionType = "transfer";
      suggestedCategory = "โอนเงิน";
      importDecision = "unresolved";
    }

    // Detect credit card payments
    const isCreditCardPayment =
      parsed.description.toLowerCase().includes("payment") ||
      parsed.description.toLowerCase().includes("ชำระบัตร") ||
      parsed.description.toLowerCase().includes("ktc") ||
      parsed.description.toLowerCase().includes("scb card");
    
    if (isCreditCardPayment && reviewStatus === "ready") {
      reviewStatus = "possible_debt_payment";
      suggestedTransactionType = "debt_payment";
      importDecision = "unresolved";
    }

    // Capture specific warnings for this row
    const validationWarnings: string[] = [];
    const rowWarning = balanceResult.warnings.find(w => w.includes(`บรรทัดที่ ${parsed.sourceRowIndex + 1}:`));
    if (rowWarning) {
      validationWarnings.push(rowWarning);
    }

    stagingRows.push({
      userId,
      importBatchId: batchId,
      sourceRowIndex: parsed.sourceRowIndex,
      rawText: parsed.rawData ? JSON.stringify(parsed.rawData) : parsed.description,
      rawData,
      occurredAt: parsed.occurredAt,
      postedAt: parsed.postedAt,
      description: parsed.description,
      merchant: parsed.merchant,
      amountSatang: parsed.amountSatang,
      direction: parsed.direction,
      runningBalanceSatang: parsed.runningBalanceSatang,
      currency: "THB",
      referenceNumber: parsed.referenceNumber,
      sourceAccountLastFour: parsed.sourceAccountLastFour,
      destinationAccountLastFour: parsed.destinationAccountLastFour,
      suggestedTransactionType,
      suggestedCategory,
      confidence: 1.0,
      duplicateScore,
      duplicateTransactionId,
      reviewStatus,
      importDecision,
      validationWarnings,
      pageNumber: parsed.pageNumber,
      sourceLineStart: parsed.sourceLineStart,
      sourceLineEnd: parsed.sourceLineEnd,
      parserSource: parsed.parserSource ?? "deterministic",
      parserConfidence: parsed.parserConfidence,
      rowFingerprint: computeRowFingerprint(batchId, parsed),
    });
  }

  return stagingRows;
}
