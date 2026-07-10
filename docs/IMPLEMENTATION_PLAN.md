# TangLak MVP Implementation Plan

## Product Spine

ตั้งหลัก is a mobile-first Thai personal finance PWA. The core invariant is:

AI extracts. Code calculates. User confirms.

AI extraction results are stored as review previews and cannot become confirmed financial totals until the user confirms them.

## Folder Structure

```text
src/
  app/                  App Router routes and API endpoints
  components/           Reusable mobile UI components
  data/                 Fictional demo data
  features/             Feature-specific forms and local state
  lib/
    ai/                 Gemini prompt/client and Zod response schemas
    finance/            Deterministic financial calculations
    supabase/           Browser/server Supabase clients
  types/                Domain TypeScript types
supabase/
  migrations/           RLS database schema
  seed.sql              Optional demo notes
tests/
  unit/                 Vitest calculation and validation tests
```

## Routes

```text
/today
/transactions
/upload
/debts
/overview
/settings
/onboarding
/auth
/api/export/transactions
```

## Phase Order

1. Foundation: Next.js, strict TypeScript, Tailwind, PWA manifest, app shell, bottom nav.
2. Database: Supabase migration, RLS policies, private storage buckets, domain types.
3. Manual records: income, expenses, debt payments, timeline, monthly totals.
4. Debt management: manual debt entry, due dates, minimum payment math, debt cards.
5. Upload and AI: server-only Gemini abstraction, Zod schema, review-first upload screen.
6. Reliability: duplicate scoring, transfer handling, CSV export, tests.

## Current MVP Slice

Implemented now:

- Calm mobile app shell and main navigation.
- Thai primary routes and copy.
- Manual transaction and manual debt forms with local draft persistence.
- Demo Today, Debt, Overview, Upload, Auth, Onboarding, Settings screens.
- Finance domain types.
- Satang money helpers.
- Monthly total, debt minimum, overdue, own-account transfer, delivery, salary, duplicate scoring logic.
- Gemini server abstraction and strict Zod schema.
- Supabase migration for all requested MVP tables, RLS, and private buckets.
- UTF-8 CSV transaction export endpoint.
- Unit tests for financial calculation layer.

Next production wiring:

- Replace local demo persistence with Supabase mutations and auth sessions.
- Add document upload API, signed URLs, extraction persistence, and review confirmation.
- Add Playwright E2E coverage against mocked Supabase/Gemini flows.
