@AGENTS.md

# Claude-Specific Instructions

These instructions are additional to, not a replacement for, `AGENTS.md`
(imported above). If anything here appears to conflict with `AGENTS.md`,
`AGENTS.md` wins — stop and ask rather than guessing which one applies.

## Before you start

1. Read `AGENTS.md` first (already imported above).
2. If the task touches transactions, debts, payments, extraction, or
   review confirmation, read
   [`docs/agent/FINANCIAL_INVARIANTS.md`](docs/agent/FINANCIAL_INVARIANTS.md)
   before editing anything.
3. Treat the GitHub Issue as the source of truth for scope and acceptance
   criteria. If the Issue is ambiguous or missing acceptance criteria,
   say so in your first comment/commit rather than inventing scope.
4. Prefer existing repository patterns over introducing new ones —
   look at how similar problems are already solved in this codebase
   (validation helpers, mock-auth test conventions, Thai copy constants,
   Bangkok-safe date helpers) before writing new abstractions.

## What you must do

- Create a dedicated branch and open a pull request. Do not commit
  directly to `master`.
- Do not merge the pull request.
- Do not deploy (Vercel deploys `master` automatically once a human
  merges — you are never responsible for triggering or confirming a
  production deployment).
- Run the repository's required verification (`npm run test`,
  `npm run lint`, `npm run typecheck`, `npm run build`, and
  `npm run test:e2e -- --workers=6` when relevant) and report exact
  commands and totals in the PR description.

## What your PR description must report

- Root cause (for bug fixes) or the design decision (for new behavior).
- Files changed and why.
- Resulting behavior, in plain terms a non-engineer owner can verify.
- Tests added or updated, and the exact verification commands/totals.
- Any risks or trade-offs you're aware of.
- A rollback note: what a human would need to do to revert this safely.

Use the repository's pull request template
(`.github/pull_request_template.md`) — fill in every section, don't leave
placeholders.

## Boundaries

- Do not expose secrets. Never read, print, or serialize `.env` values,
  and never hardcode a value that looks like a Supabase key, service-role
  key, or API key.
- Do not modify `supabase/migrations/` unless the Issue explicitly states
  that a migration is allowed. If a migration is genuinely required but
  not authorized, stop and explain why in your PR/comment instead of
  adding one anyway.
- Do not alter UI design (layout, spacing, color, component structure)
  unless the Issue requests a UI change. Fixing a bug should not become
  an excuse to restyle the surrounding component.
- When you do change UI, attach screenshots for both a mobile viewport
  (this app is mobile-first) and a desktop viewport where the change is
  visible, per the pull request template.

## When requirements conflict

If the Issue, `AGENTS.md`, and `docs/agent/FINANCIAL_INVARIANTS.md` seem
to disagree, or the requested change would require weakening a financial
invariant, a security check, or an existing test's real assertion: stop,
do not implement the ambiguous/unsafe interpretation, and post a comment
explaining the conflict and asking for clarification instead of guessing.

## Responding to review feedback

When Codex (or a human) leaves review findings on your PR, respond with
focused commits that address the specific findings — do not use review
feedback as an opportunity to rewrite unrelated code, refactor nearby
files, or restart the implementation from scratch.
