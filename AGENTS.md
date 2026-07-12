<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TangLak Agent Operating Rules

This file applies to every coding agent working in this repository (Claude,
Codex, Gemini, or any other automated contributor), in every environment
(local, cloud, GitHub Actions). Read this before making any change.

TangLak is a personal-finance app handling real transaction, debt, and
document data. Treat every change as touching a live financial product,
even when the task looks purely cosmetic.

For finance-related work, also read
[`docs/agent/FINANCIAL_INVARIANTS.md`](docs/agent/FINANCIAL_INVARIANTS.md)
before editing.

## Git

- Never work directly on `master`.
- Always use a dedicated branch and open a pull request.
- Never force-push `master`.
- Never rewrite shared history (no rebase/amend of commits already pushed
  to a shared branch).
- Never merge or deploy automatically. Human approval is required before
  merge.
- Cloud agents must not depend on local Windows worktree paths
  (`C:\Project\...`). Write paths and instructions that work in any
  environment.
- Do not create unnecessary worktrees when working in a cloud environment —
  worktrees are a local-development convenience, not a requirement.

## Scope

- Read the Issue and its acceptance criteria before editing anything.
- Keep changes inside the requested scope. If you notice unrelated
  problems, mention them in the PR description instead of fixing them.
- Do not perform broad cleanup, formatting passes, or refactoring unless
  the Issue explicitly asks for it.
- Stop and ask (or clearly flag the ambiguity in your PR/comment) when a
  destructive action or a financial-behavior decision is unclear from the
  Issue. Do not guess on money-affecting logic.

## Security

- Never print, commit, expose, or serialize `.env` values (including in
  logs, test output, commit messages, or PR descriptions).
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code, client bundles,
  or any file reachable from a `"use client"` component.
- Never modify production Supabase data. Local/mock data only for testing.
- Preserve existing authentication and ownership checks
  (`requireUser`, `assertDebtBelongsToUser`, `assertAccountBelongsToUser`,
  RLS-relevant filters) — do not remove or weaken them to make a task
  easier.
- Use least-privilege GitHub Actions permissions
  (`permissions: contents: read` by default; add scopes only when a job
  clearly requires them).
- Never use `pull_request_target` to execute untrusted pull-request code.
- Never log secrets, even partially or for debugging.

## Financial invariants

These are locked product rules. Do not weaken, bypass, or "temporarily"
disable any of them without an Issue that explicitly authorizes it:

- Debt paid-this-cycle is cycle-scoped (never a lifetime total).
- Recording a debt payment must not automatically reduce
  `outstanding_balance_satang`.
- Every `debt_payment` transaction must reference a `debt_id`.
- Reopening a closed debt is disabled in Phase 1.
- `minimum_payment_satang` must never exceed `outstanding_balance_satang`.
- A missing transaction timestamp must never receive current time, upload
  time, document `created_at`, retry time, or server time as a fallback.
- Final financial confirmation must validate all required fields
  server-side before any write — client-side validation alone is never
  sufficient.
- A validation failure must not create a partial financial record (no
  half-written transaction, debt payment, or cycle-progress update).
- Retry must reuse the existing document row and storage object where the
  system is designed to do so (never silently duplicate).

Full detail, rationale, and examples of prohibited behavior:
[`docs/agent/FINANCIAL_INVARIANTS.md`](docs/agent/FINANCIAL_INVARIANTS.md).

## Validation

- Run focused tests for the exact behavior you changed before running the
  full suite.
- Run the repository's required verification commands before marking a
  task complete: `npm run test`, `npm run lint`, `npm run typecheck`,
  `npm run build`, and `npm run test:e2e -- --workers=6` when the change
  could affect UI, routing, or server actions.
- Report the exact commands you ran and the resulting test totals in your
  PR description — not just "tests pass."
- Never weaken, remove, skip, or rewrite a test merely to obtain a
  passing result. If a test is wrong, say so explicitly and explain why.
- Distinguish a deterministic failure from a known flake (see
  `docs/agent/WORKFLOW.md` for the documented flake-handling procedure)
  before deciding a suite is green.
- UI changes require screenshots (or equivalent evidence, e.g. a
  Playwright trace/video) attached to the PR, for both mobile and desktop
  viewports where applicable.
