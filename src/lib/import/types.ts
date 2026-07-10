import type { ImportRowDirection, TransactionType } from "@/types/domain";

export interface ParsedTransaction {
  sourceRowIndex: number;
  occurredAt: string;
  postedAt?: string;
  description: string;
  merchant?: string;
  amountSatang: number;
  direction: ImportRowDirection;
  runningBalanceSatang?: number;
  referenceNumber?: string;
  sourceAccountLastFour?: string;
  destinationAccountLastFour?: string;
  suggestedTransactionType?: TransactionType;
  suggestedCategory?: string;
  rawData?: unknown;
  // Populated by the deterministic PDF parser; optional so CSV parsers are unaffected.
  pageNumber?: number;
  sourceLineStart?: number;
  sourceLineEnd?: number;
  parserSource?: "deterministic" | "gemini_assisted";
  parserConfidence?: number;
}

export interface StatementPeriod {
  periodStart?: string;
  periodEnd?: string;
  statementDate?: string;
}

export interface ParseResult {
  sourceType: string;
  sourceName: string;
  rows: ParsedTransaction[];
  period?: StatementPeriod;
  accountLastFour?: string;
  totalRows: number;
  // Optional PDF-specific metadata surfaced up to the import batch record.
  statementMetadata?: unknown;
  detectedLayout?: unknown;
  pageCount?: number;
  parserName?: string;
  parserVersion?: string;
}

export type ParseStatementFileContext = {
  bytes?: Uint8Array;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  password?: string;
};

export interface ImportParser {
  name: string;
  version: string;
  canParse(fileExtension: string, mimeType: string, firstBytes: string): Promise<boolean>;
  parse(fileData: Buffer | string, context?: ParseStatementFileContext): Promise<ParseResult>;
}
