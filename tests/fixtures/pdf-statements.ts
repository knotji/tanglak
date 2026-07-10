import PDFDocument from "pdfkit";

async function renderPdf(build: (doc: PDFKit.PDFDocument) => void, options?: PDFKit.PDFDocumentOptions): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, ...options });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));
  build(doc);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

interface FixtureRow {
  date: string;
  description: string;
  debit?: string;
  credit?: string;
  balance: string;
}

const COL_WIDTHS = { date: 13, description: 31, debit: 15, credit: 15 };

const HEADER_LINE = formatRow({ date: "Date", description: "Description", debit: "Debit", credit: "Credit", balance: "Balance" });

function formatRow(row: FixtureRow): string {
  const debit = (row.debit ?? "").padEnd(COL_WIDTHS.debit);
  const credit = (row.credit ?? "").padEnd(COL_WIDTHS.credit);
  return `${row.date.padEnd(COL_WIDTHS.date)}${row.description.padEnd(COL_WIDTHS.description)}${debit}${credit}${row.balance}`;
}

/**
 * Builds a 32-row, 3-page generic bank statement (layout A: debit/credit/balance)
 * exercising: repeated header per page, multiline description, a row split
 * across a page boundary, a row with no year (inherits from statement period),
 * and a Buddhist-year (พ.ศ.) row. All figures are fictional.
 */
export async function buildGenericBankStatementPdf(): Promise<Buffer> {
  const rows: FixtureRow[] = [];
  let balance = 5000000; // satang, 50,000.00 THB opening

  for (let i = 1; i <= 30; i++) {
    const day = String(1 + (i % 27)).padStart(2, "0");
    const isCredit = i % 4 === 0;
    const amountSatang = 15000 + i * 1000;
    if (isCredit) balance += amountSatang;
    else balance -= amountSatang;

    // Row 20 is deliberately a credit-card payment: the shared staging
    // pipeline (processStagingRows) auto-classifies it as
    // possible_debt_payment and leaves it importDecision: "unresolved" by
    // default, giving import-flow tests a row that stays unresolved unless
    // a reviewer explicitly resolves it (exercising partial-import/resume).
    const description = i === 20 ? "KTC PAYMENT BKK" : `MERCHANT ${String(i).padStart(3, "0")} BKK`;

    rows.push({
      date: `${day}/07/2569`,
      description,
      debit: isCredit ? undefined : (amountSatang / 100).toFixed(2),
      credit: isCredit ? (amountSatang / 100).toFixed(2) : undefined,
      balance: (balance / 100).toFixed(2),
    });
  }

  return renderPdf((doc) => {
    doc.fontSize(12).text("KBank Statement", { continued: false });
    doc.fontSize(9).text("Account Name: SOMCHAI JAIDEE");
    doc.text("Account No: xxxx-x-x1234-x");
    doc.text("Statement Period: 01/07/2569 - 31/07/2569");
    doc.text("Opening Balance: 50,000.00");
    doc.moveDown(0.5);

    let rowsOnPage = 0;
    const rowsPerPage = 11;

    doc.font("Courier").fontSize(8).text(HEADER_LINE);
    for (let i = 0; i < rows.length; i++) {
      if (rowsOnPage >= rowsPerPage) {
        doc.addPage();
        doc.font("Courier").fontSize(8).text(HEADER_LINE);
        rowsOnPage = 0;
      }

      const row = rows[i];
      // Row #7 (index 6) demonstrates a multiline wrapped description.
      if (i === 6) {
        doc.text(formatRow({ ...row, description: "GRAB*FOOD" }));
        doc.text("             BANGKOK TH");
      } else if (i === 15) {
        // Row without a year token — the parser must infer it from the period.
        doc.text(formatRow({ ...row, date: row.date.slice(0, 5) }));
      } else {
        doc.text(formatRow(row));
      }
      rowsOnPage++;
    }

    doc.moveDown(0.5);
    doc.text(`Closing Balance: ${(balance / 100).toFixed(2)}`);
  });
}

/** A PDF with only a filled rectangle and no text layer — should be rejected as no_text_layer. */
export async function buildNoTextLayerPdf(): Promise<Buffer> {
  return renderPdf((doc) => {
    doc.rect(50, 50, 400, 600).fill("#eeeeee");
  });
}

/** Valid header magic bytes but truncated/corrupted body — should be rejected as malformed_pdf. */
export function buildMalformedPdf(): Buffer {
  return Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\nThis is not a real PDF body, just noise.\n%%EOF");
}

/** A PDF whose only content is narrative prose with no recognizable table header. */
export async function buildUnsupportedLayoutPdf(): Promise<Buffer> {
  return renderPdf((doc) => {
    doc.fontSize(11).text(
      "This document is a plain narrative letter with no tabular transaction data. " +
        "It intentionally has no date/amount table so the generic layout detector " +
        "cannot classify a header row and must fall back to unsupported_layout.",
      { width: 400 },
    );
  });
}

/** A real password-protected PDF (AES/RC4 via pdfkit) — should be rejected as password_protected_pdf. */
export async function buildPasswordProtectedPdf(): Promise<Buffer> {
  return renderPdf(
    (doc) => {
      doc.fontSize(12).text("Confidential statement content.");
    },
    {
      userPassword: "secret123",
      ownerPassword: "owner-secret",
      permissions: { printing: "lowResolution" },
    },
  );
}
