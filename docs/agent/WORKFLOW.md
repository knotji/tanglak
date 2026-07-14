# TangLak Agent Workflow

This describes the intended end-to-end flow for creating and shipping a
change to TangLak using coding agents, starting and ending entirely from
a phone if desired. See [`docs/agent/OWNER_SETUP_CHECKLIST.md`](OWNER_SETUP_CHECKLIST.md)
for the one-time setup this flow depends on, and
[`docs/agent/FIRST_TASK_EXAMPLE.md`](FIRST_TASK_EXAMPLE.md) for a worked
example.

## Phone-first task flow

1. Owner opens GitHub Mobile.
2. Owner creates a new Issue using one of the templates (Agent Task, Bug
   Report, or UX Task).
3. Owner fills in the acceptance criteria field as specifically as
   possible — this is what the agent and the human reviewer will both
   check the final result against.
4. Owner invokes Claude by commenting `@claude ...` on the Issue (see the
   supported integration in `.github/workflows/claude.yml`, active once
   the owner completes the GitHub App setup).
5. Claude reads `AGENTS.md`, `CLAUDE.md`, and (if relevant)
   `docs/agent/FINANCIAL_INVARIANTS.md`, then creates a dedicated branch
   and opens a pull request implementing the Issue.
6. GitHub Actions CI (`.github/workflows/ci.yml`) runs automatically on
   the pull request: Unit / Static Checks, Build, and E2E.
7. Owner requests a Codex review by commenting `@codex review` on the
   pull request.
8. If Codex reports a blocker or high-severity finding, Claude (or the
   owner, via another `@claude` comment) pushes a focused fix commit
   addressing that specific finding.
9. CI reruns automatically on the new commit.
10. Human reviews: the PR description (summary, root cause, files
    changed), screenshots/evidence for any UI change, test
    commands/totals, and the Codex review findings.
11. Human merges the pull request into `master`. No agent merges a
    pull request in Phase 1.
12. Vercel deploys `master` to production (`https://tanglak.vercel.app`)
    automatically once the merge lands.
13. Human performs production smoke testing using the "Production
    smoke-test plan" section of the merged PR.

## Agent roles

- **Claude** — implementation. Turns an Issue into a pull request;
  responds to `@claude` mentions on Issues and PRs with focused
  implementation or fix commits.
- **Codex** — serious PR review. Invoked via `@codex review`; looks for
  regressions, correctness issues, and violations of
  `docs/agent/FINANCIAL_INVARIANTS.md`. Treated as a merge gate: a
  blocker or high-severity finding should be resolved before a human
  merges.
- **Gemini** — optional UX/screenshot/accessibility/issue-triage review.
  Not part of the required merge gate; used at the owner's discretion for
  additional UI/UX feedback.
- **Human (owner)** — scope approval, secrets, repository settings,
  merge, deployment verification, and any testing that touches real
  production data. These responsibilities are never delegated to an
  agent.

## Safety

- No agent auto-merges a pull request in Phase 1. Merge is always a
  human action.
- No agent auto-deploys. Deployment is Vercel building `master`
  automatically after a human merge — no agent triggers or confirms a
  production deployment.
- No agent mutates the production database. Agents work against local
  state, mocked auth (`E2E_MOCK_AUTH=1`), and test data only.
- No broad multi-agent editing of the same pull request at once. One
  agent implements (Claude); one agent reviews (Codex); if a human or a
  second agent needs to make an unrelated change, it goes in its own
  pull request.
- One builder, one reviewer, one human approver — for any single change.

## Handling CI flakes

If a required check fails, first re-run it once via the GitHub Actions
UI (or `workflow_dispatch`) before concluding it's a real failure. A
failure is a flake only if: (a) the change did not touch the failing
area at all, and (b) an unmodified re-run of the exact same commit
passes. Anything else is treated as a real, deterministic failure that
must be fixed — do not merge past it and do not weaken the test.

## App Release Process

To bump the app version and update the "Latest Update" date shown in Settings:

1.  Update the `"version"` field in `package.json`.
2.  Update the `"releaseDate"` field in `src/lib/metadata/release-date.json` using the `YYYY-MM-DD` format.
3.  Include these changes in your pull request.
