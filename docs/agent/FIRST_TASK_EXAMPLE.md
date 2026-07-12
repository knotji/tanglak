# First Task Example

A worked example of the phone-first flow in
[`docs/agent/WORKFLOW.md`](WORKFLOW.md), using a real bug as the first
task to run through this pipeline once setup is complete.

## The Issue

Create this using the **Bug Report** template.

**Title:**

```
Support Thai Buddhist bank-slip dates such as 05 ก.ค. 2569 - 13:44
```

**Context:**

An SCB bank transfer slip containing the Thai Buddhist-era date
`05 ก.ค. 2569 - 13:44` (abbreviated Thai month `ก.ค.` = July, Buddhist
year 2569 = Gregorian year 2026) is routed to `needs_review` instead of
being extracted correctly. The expected, correctly parsed timestamp for
this slip is:

```
2026-07-05T13:44:00+07:00
```

**Acceptance criteria:**

- [ ] Thai abbreviated month names (`ม.ค.`, `ก.พ.`, `มี.ค.`, `เม.ย.`,
      `พ.ค.`, `มิ.ย.`, `ก.ค.`, `ส.ค.`, `ก.ย.`, `ต.ค.`, `พ.ย.`, `ธ.ค.`)
      are recognized when parsing slip dates.
- [ ] A Buddhist-era (BE) year is converted to the correct Gregorian
      year (BE − 543).
- [ ] The Bangkok wall-clock time on the slip (`13:44`) is preserved
      exactly — the result must be `2026-07-05T13:44:00+07:00`, not
      shifted by parsing through a different timezone.
- [ ] No current-time, upload-time, or any other fallback is used if
      the date is present but initially unparsed — the actual slip date
      must be used once parsing succeeds.
- [ ] If the date is genuinely invalid or missing, the document still
      correctly routes to `needs_review` (this case must keep working).
- [ ] A regression fixture and test are added using this exact slip
      date string, so this exact bug cannot silently regress.
- [ ] `npm run test`, `npm run lint`, `npm run typecheck`, and
      `npm run build` all pass.
- [ ] `npm run test:e2e -- --workers=6` passes (or the relevant subset,
      if the change is proven not to affect other E2E coverage).
- [ ] No Supabase migration is added (this is a parsing-logic-only fix;
      migration allowed: No).
- [ ] Claude opens a pull request implementing this fix; a human merges
      it after Codex review — no agent merges or deploys.

## The flow, step by step

1. Owner creates the Issue above using the **Bug Report** template on
   GitHub Mobile.
2. Owner comments on the Issue:

   ```
   @claude implement this issue and open a pull request. Follow AGENTS.md and CLAUDE.md. Do not merge or deploy.
   ```

3. Claude reads `AGENTS.md`, `CLAUDE.md`, and
   `docs/agent/FINANCIAL_INVARIANTS.md` (this touches document
   extraction, so the invariants file applies — specifically invariants
   #9, #11, and #12), implements the fix, adds the regression test, and
   opens a pull request using `.github/pull_request_template.md`.
4. CI (`.github/workflows/ci.yml`) runs automatically on the pull
   request.
5. Owner comments on the pull request:

   ```
   @codex review
   ```

6. If Codex reports a blocker or high-severity finding, Claude pushes a
   focused fix commit; CI reruns.
7. Owner reviews the PR summary, the regression test, the test
   totals, and the Codex findings, then merges.
8. Vercel deploys `master`; owner performs the production smoke test
   described in the PR's "Production smoke-test plan" section (e.g.
   re-uploading a slip with a Thai Buddhist-era date in production and
   confirming it is no longer routed to `needs_review`).
