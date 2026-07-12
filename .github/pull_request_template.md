<!--
Fill in every section. Do not delete a section — write "N/A" with a reason
if it genuinely does not apply. See AGENTS.md and CLAUDE.md for the rules
this PR must follow.
-->

## Linked Issue

Closes #

## Root cause

<!-- For a bug fix: what was actually wrong, and why. For new behavior: the design decision made and why. -->

## Summary

<!-- Plain-language description a non-engineer owner can read to understand what changed. -->

## Files changed

<!-- List the changed files and, for each, a one-line reason. -->

## Screenshots

<!-- Required for any UI change. Include both mobile and desktop viewports where the change is visible. Write "N/A — no UI change" if none. -->

## Financial invariant impact

<!-- Does this PR touch anything in docs/agent/FINANCIAL_INVARIANTS.md? If yes, state which invariant(s) and how they are preserved. If no, say "None." -->

## Migration status

<!-- "No migration" or "Migration added: <file>, authorized by Issue #<n> (migration allowed: Yes)". -->

## Security impact

<!-- Any change to auth checks, ownership checks, secrets, or GitHub Actions permissions? If none, say "None." -->

## Test commands and totals

<!-- Exact commands run and their exact result totals, e.g.:
npm run test        -> 123 passed
npm run lint         -> 0 problems
npm run typecheck    -> 0 errors
npm run build         -> succeeded
-->

## E2E result

<!-- Exact command and result, or state why E2E was not run/relevant. -->

## Known risks

<!-- Trade-offs, edge cases not covered, anything you're unsure about. -->

## Rollback plan

<!-- What a human would need to do to revert this safely if it causes a problem after merge. -->

## Production smoke-test plan

<!-- What the owner should manually check in production (tanglak.vercel.app) after this is merged and deployed. -->

## Checklist

- [ ] No direct production changes were made (no production Supabase writes, no manual prod config changes)
- [ ] No secrets were committed or printed (checked diff for `.env` values, keys, tokens)
- [ ] This PR will not be merged automatically — a human will review and merge
- [ ] No unauthorized migration was added (see "Migration status" above)
- [ ] Server-side validation for any financial write was preserved or added (not just client-side)
- [ ] CI passes (Unit / Static Checks, Build, E2E)
