# Live PDF Statement Import Smoke Test

Use this only against a disposable Supabase project or disposable test users.
Never run this against real customer statements outside a controlled test
environment — the whole point of Phase 2 is that raw statement text and
PDF bytes stay inside your own private Storage bucket and RLS-scoped tables.

## Supported first-version PDF characteristics

The deterministic parser (`src/lib/import/pdf/`) targets **text-based**
statements only:

- The PDF has a genuine text layer (created by "Export/Download PDF" from
  online/mobile banking, not a scanned/photographed statement).
- A single header row containing recognizable column labels (Date,
  Description, Debit/Withdrawal, Credit/Deposit, Balance, Amount, etc., in
  Thai or English).
- A generic tabular layout (layouts A–F in the design doc — debit/credit
  columns, a single signed/unsigned amount column, or withdrawal/deposit
  columns, each optionally with a running balance).
- Not password-protected.
- Not a bank-specific proprietary layout the generic detector has never
  seen — if the header row doesn't contain recognizable column keywords, the
  batch is rejected with a Thai message suggesting the bank's CSV export
  instead.

Scanned/photographed statements and bank-specific adapters are explicitly
out of scope for this phase (see `docs/IMPLEMENTATION_PLAN.md`).

## How to verify a PDF has a text layer before testing

1. Open the PDF in a desktop viewer and try to select/copy text with the
   mouse. If you can highlight and copy the transaction rows, it has a text
   layer.
2. Alternatively, run `pdftotext statement.pdf -` (poppler-utils) or open
   dev tools on `chrome://pdf-viewer` — if the extracted text is empty or
   garbage, it's image-only and will be rejected as `no_text_layer`.

## Safe test procedure

1. Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` to a
   **disposable** Supabase project with the migrations in
   `supabase/migrations` applied (through `202607100007_pdf_statement_import.sql`).
2. Sign up a disposable test user.
3. Go to **ตั้งค่า → ข้อมูลและการนำเข้า → + นำเข้า Statement ใหม่**.
4. Upload a text-based bank statement PDF containing **fictional or your
   own test data only** — never a real customer's statement.
5. Submit and confirm you land on `/history-import/<batchId>/review`.

## Expected row counts

- For a statement with N visible transaction rows (including any that wrap
  across multiple lines or pages), the review screen should show N rows —
  continuation lines must merge into their parent row, not appear as
  separate blank/garbage rows.
- The header badges should show the detected bank name (if recognizable),
  masked account (`•••• 1234`), page count, and detected layout ID with a
  confidence percentage.
- Rows with a reading-warning icon are surfaced under the
  "มีคำเตือนการอ่าน" filter tab — spot-check a few of these against the
  original PDF page (the badge on each row links to "ดูจากหน้า N").

## How to inspect the batch/rows in Supabase

```sql
select id, source_type, status, total_rows, page_count, statement_metadata, detected_layout
from import_batches
where user_id = '<test-user-id>'
order by created_at desc
limit 1;

select source_row_index, page_number, parser_source, parser_confidence,
       occurred_at, description, amount_satang, direction, running_balance_satang,
       review_status, import_decision, validation_warnings, row_fingerprint
from import_rows
where import_batch_id = '<batch-id>'
order by source_row_index;
```

Confirm:

- `row_fingerprint` is non-null and unique per row within the batch.
- `parser_source` is `deterministic` for the vast majority of rows; only
  rows where the deterministic layout detector had low confidence should
  show `gemini_assisted`.
- No row's `raw_text` looks truncated mid-transaction (a sign continuation
  lines weren't grouped correctly).

## How to verify source file privacy

```sql
select storage_path from import_batches where id = '<batch-id>';
```

1. Confirm the path is `<user_id>/history-imports/<batch_id>/<safe_filename>`.
2. In the Supabase dashboard, confirm the `financial-documents` bucket is
   **private** (not public).
3. As a second disposable test user, attempt to fetch that storage path
   directly through the Supabase client — it must fail (RLS/ownership
   check), and `GET /history-import/<batchId>/review` for the batch must
   404 for that second user.
4. Confirm application logs (`console.error` output in the server process)
   never contain the full extracted statement text — only short Thai
   error messages and PDF error codes.

## How to test partial import

1. On the review screen, explicitly set an "import" or "skip" decision on
   only some rows (leave the rest at their server-assigned default).
2. Confirm — the batch should land in `settings/data` with status
   "เสร็จสิ้นบางส่วน" (`partially_imported`).
3. Reload `/settings/data` and click "ตรวจต่อ" — you should return to the
   same review screen with previously-imported rows already marked, and
   the remaining rows still awaiting a decision.
4. Resolve the rest and confirm again — status should become "นำเข้าแล้ว"
   (`completed`).

## How to test rollback

1. From a `completed` or `partially_imported` batch on `/settings/data`,
   click "ย้อนกลับ (Rollback)".
2. Confirm the batch status becomes "ย้อนกลับแล้ว" (`rolled_back`) and the
   rollback button disappears (the UI intentionally does not allow
   re-triggering rollback on an already-rolled-back batch).
3. Go to `/transactions` and confirm every transaction this batch created
   is gone.
4. Go to `/overview` and confirm totals/debt progress recalculated to
   exclude the rolled-back transactions.
5. Confirm any pre-existing transactions this batch had only **linked** to
   via "merge_existing" (duplicate matching) still exist — rollback must
   only delete transactions it *created*, never ones it merely referenced.

## How to confirm no duplicate transactions

1. Re-upload the exact same PDF as a second batch for the same user.
2. On the review screen, rows matching prior confirmed transactions should
   be flagged `possible_duplicate` / `exact_duplicate` with a duplicate
   score, defaulting to "skip" or "unresolved" — not silently auto-imported.
3. Confirm the batch and check `/transactions` — no amounts should appear
   twice unless you explicitly chose "นำเข้าเป็นธุรกรรมใหม่" on a duplicate
   row.

## Known unsupported cases (expected rejections)

| Case | Expected Thai message |
|---|---|
| Password-protected PDF | "Statement นี้มีรหัสผ่าน กรุณาดาวน์โหลดไฟล์ที่ไม่ล็อกแล้วลองใหม่" |
| Scanned PDF / no text layer | "ไฟล์นี้ไม่มีข้อความที่อ่านได้ Phase นี้ยังไม่รองรับ Statement แบบสแกน ลองใช้ CSV แทน" |
| Unrecognized table layout | "อ่านรูปแบบตารางนี้ได้ไม่ครบ ลองดาวน์โหลด CSV จากธนาคารแล้วนำเข้าแทนได้" |
| Malformed/corrupted PDF | "ไฟล์ PDF นี้เสียหายหรือเปิดไม่ได้" |
| File over 10MB | "ไฟล์มีขนาดใหญ่เกินไป" |
| Non-PDF file with a `.pdf` name | "ไฟล์นี้ไม่ใช่ PDF ที่รองรับ" |

None of these should ever crash the History Import page — each surfaces as
an inline error on the upload form, and the batch (if one was created) is
marked `failed` rather than left in an ambiguous state.
