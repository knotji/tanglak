import type { ImportParser, ParseResult } from "../types";
import { parsePdfStatement, PDF_PARSER_NAME, PDF_PARSER_VERSION } from "../pdf";

export class GenericBankPDFParser implements ImportParser {
  name = PDF_PARSER_NAME;
  version = PDF_PARSER_VERSION;

  async canParse(fileExtension: string, mimeType: string): Promise<boolean> {
    return fileExtension === "pdf" || mimeType === "application/pdf";
  }

  async parse(fileData: Buffer | string): Promise<ParseResult> {
    const buffer = typeof fileData === "string" ? Buffer.from(fileData) : fileData;
    return parsePdfStatement(buffer);
  }
}
