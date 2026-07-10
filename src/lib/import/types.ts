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
}

export interface ImportParser {
  name: string;
  version: string;
  canParse(fileExtension: string, mimeType: string, firstBytes: string): Promise<boolean>;
  parse(fileData: Buffer | string): Promise<ParseResult>;
}
