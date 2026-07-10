import type { ImportParser, ParseResult, ParseStatementFileContext } from "../types";
import { parsePdfStatement, PDF_PARSER_NAME, PDF_PARSER_VERSION } from "../pdf";

export class GenericBankPDFParser implements ImportParser {
  name = PDF_PARSER_NAME;
  version = PDF_PARSER_VERSION;

  async canParse(fileExtension: string, mimeType: string): Promise<boolean> {
    return fileExtension === "pdf" || mimeType === "application/pdf";
  }

  async parse(fileData: Buffer | string, context?: ParseStatementFileContext): Promise<ParseResult> {
    const buffer = typeof fileData === "string" ? Buffer.from(fileData) : fileData;
    return parsePdfStatement({
      bytes: context?.bytes ?? new Uint8Array(buffer),
      originalFilename: context?.originalFilename ?? "statement.pdf",
      mimeType: context?.mimeType ?? "application/pdf",
      fileSize: context?.fileSize ?? buffer.byteLength,
      storagePath: context?.storagePath ?? "",
      password: context?.password,
    });
  }
}
