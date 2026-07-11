# Slip-First Product Direction

## Why bank statement import is deprecated

TangLak's original onboarding path encouraged uploading a full bank/credit-card
statement (CSV or PDF) containing hundreds of historical transactions. In
practice this created an overwhelming first-use experience: users faced a
large, unfamiliar review queue before they had recorded a single transaction
of their own, and most of the app's complexity budget (parser variants,
duplicate detection, multi-row review, rollback) went toward a flow most
users only touch once, if ever.

The new primary workflow starts from the current/latest month and grows
gradually: upload a slip or receipt as it happens, add a transaction manually
when there's no slip, plan a monthly budget, and track debts with their due
dates and minimum payments. Statement import is **deprecated from the primary
UI**, not removed.

## What remains in the backend

Nothing was deleted. Kept as-is, byte-for-byte:

- `supabase/migrations/202607100005_history_import_support.sql`,
  `202607100006_history_import_hardening.sql`, `202607100009_pdf_statement_import.sql`,
  `202607110002_history_import_idempotency.sql`, and every RLS policy and
  table (`import_batches`, `import_rows`) they define.
- The deterministic and Gemini-assisted PDF/CSV parsers
  (`src/lib/import/**`).
- The idempotent commit RPCs and rollback logic (`importReviewedRows`,
  `rollbackImportBatch` in `src/lib/data/finance-repository.ts`, and the
  underlying `import_commit_row`/`import_rollback_batch` database functions).
- Every existing backend safety test: `tests/unit/history-import-idempotency*.test.ts`,
  `tests/unit/pdf-import.test.ts`, `tests/e2e/history-import*.spec.ts`.
- Existing users' already-imported transactions and import batch history —
  untouched, still fully visible on `/settings/data` and in `/transactions`.

## Slip-first flow

`/upload` leads with **อัปโหลดสลิป** (primary) and offers **เพิ่มรายการเอง**
(secondary, always available, links to `/transactions`) as an equal-footing
fallback — a user is never trapped waiting on AI processing. The document-type
quick-select is scoped to five real user intents:

- สลิปโอนเงินออก / สลิปรับเงิน / ใบเสร็จ-ค่าอาหาร / สลิปชำระหนี้หรือบัตรเครดิต / เพิ่มรายการเอง

Bank-statement and loan-schedule document types (`debt_statement`,
`loan_schedule`) are no longer offered as quick-select tiles on this page —
they are still supported by the AI extraction schema and reachable through
the legacy `/history-import` route, just not promoted here.

Debt-payment slips already flow into `ReviewForm`'s existing debt-linking
UI (`ชำระหนี้สิน` transfer type + a required "เชื่อมต่อกับหนี้สินคงค้าง" debt
picker): the user explicitly chooses an existing debt from a dropdown built
from `listDebts`; nothing is auto-linked from an account number or slip
content, and no debt is ever created implicitly. If the user picks "ใช้จ่าย
(Expense)" instead, the transaction saves as a normal expense and no debt
link is created.

## Legacy route behavior

Direct/bookmarked access to `/history-import` still works — the underlying
`HistoryImportClient` upload-and-review flow is unchanged — but the page now
leads with a calm notice instead of presenting statement import as the
primary action:

> การนำเข้ารายการจำนวนมากถูกพักไว้ชั่วคราว
>
> แนะนำให้อัปโหลดสลิปหรือเพิ่มรายการทีละรายการ เพื่อเริ่มติดตามการเงินตั้งแต่เดือนนี้

with three actions: อัปโหลดสลิป, เพิ่มรายการเอง, กลับหน้าวันนี้. No "feature
disabled" or technical language is shown.

`/settings` moves the statement-import entry point into a new "ขั้นสูง"
(Advanced) section, relabeled **การนำเข้ารายการแบบเดิม**, with the warning
copy **เหมาะสำหรับข้อมูลจำนวนมากและต้องตรวจสอบหลายรายการ** — it is present,
but not the recommended path. `/settings/data` (import batch history,
rollback) is unchanged and still reachable from the main "ข้อมูล" section,
since it also serves the slip/document upload history, not just statement
imports.

## Remaining limitations

- No automated redirect exists from old marketing/onboarding copy that may
  still reference statement import outside this codebase (app store
  listings, etc.) — out of scope for this change.
- The onboarding flow already contained no statement-import references
  before this change, so no onboarding-specific removal was required.
- `FinancePrimitivesDemo` and other pre-existing orphaned fixtures are
  unrelated to this pivot and were left untouched.
