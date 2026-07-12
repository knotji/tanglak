# Supabase Config Hydration Audit

## Environment

- Primary repository: `C:\Project\tanglak`
- Fix worktree: `C:\Project\tanglak-config-hydration-fix`
- Audit worktree: `C:\Project\tanglak-config-hydration-audit`
- Fix branch audited: `fix/supabase-config-hydration`
- Audit branch: `audit/supabase-config-hydration`
- Base commit: `58413b9d48be8face9e93b70cec3ceaaf8fca8e0`
- Source/fix commit audited: `fad2a72ace09334e9cebec2d1e2eb02f1f57152c`
- Scope audited:
  - `src/lib/supabase/config.ts`
  - `tests/e2e/config-hydration.spec.ts`
  - `tests/unit/config-static-env-access.test.ts`
  - `tests/unit/config.test.ts`

## Recommendation

APPROVE WITH NON-BLOCKING NOTES.

The fix addresses the likely hydration root cause by replacing dynamic public Supabase environment-key lookup with literal `process.env.NEXT_PUBLIC_SUPABASE_*` reads. It does not introduce client-only rendering workarounds, does not expose service-role configuration through the audited config path, and preserves the intended public-key fallback order.

## Findings

### Blocker

None.

### High

None.

### Medium

None.

### Low

None.

### Informational

- Production-build E2E coverage cannot exactly reproduce the original development-only missing-config UI mismatch because `ConfigError` intentionally renders `null` in production. The static source test and unit tests cover the regression shape, and the E2E spec verifies AppShell route hydration in the production test harness.
- The first full E2E run failed in unrelated `document-flow` and `budget` specs. Both affected specs passed in targeted reruns, and the canonical full E2E command passed on rerun with `83` tests. The audited `config-hydration` spec passed.

## Root-Cause Validation

PASS.

- `firstConfiguredPublicKey()` now reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` through literal property access.
- `NEXT_PUBLIC_SUPABASE_URL` is also read through literal property access.
- The audited config module no longer uses dynamic `process.env[key]`, arrays of public env names, loops over public env keys, or `Object.keys(process.env)` for Supabase public configuration.
- No `typeof window`, `useEffect`, `suppressHydrationWarning`, or other client-only hydration workaround was introduced.
- The public key priority remains deterministic: anon key first, publishable key second.
- The app still allows exactly one public key with URL; it does not require both public keys.
- Missing URL, missing public key, and service-role-only configurations fail validation.

## Security Validation

PASS.

- Browser Supabase client construction receives only the public URL and the selected public anon/publishable key.
- Server Supabase client construction also uses the public config path; the audited change does not add service-role usage.
- The config module does not read or return `SUPABASE_SERVICE_ROLE_KEY`.
- Static tests assert that service-role config is not part of the public config module.
- Built assets were searched for service-role identifiers and the test placeholder; no service-role marker was found in `.next`.
- Production validation messaging remains generic and does not disclose configured values.
- Tests use placeholder values only; no real secret values were observed in the audited changes.

## Behavior Matrix

| Scenario | Result | Notes |
| --- | --- | --- |
| URL + anon key | PASS | Valid configuration. |
| URL + publishable key | PASS | Valid configuration. |
| URL + both public keys | PASS | Anon key remains preferred. |
| Missing URL | PASS | Validation fails. |
| Missing both public keys | PASS | Validation fails. |
| Service-role-only config | PASS | Validation fails and service-role is not returned. |
| Repeated validation calls | PASS | Deterministic status object; no module-level stale snapshot introduced. |
| Server render/client hydration route coverage | PASS | E2E covers direct refresh and client navigation through AppShell routes. |
| Missing-config UI in production E2E | NOTE | Not expected to render because `ConfigError` returns `null` in production. |

## Tests

Commands run from `C:\Project\tanglak-config-hydration-audit`:

- `npm ci` - PASS
- `npx vitest run tests/unit/config.test.ts` - PASS, `10` tests
- `npx vitest run tests/unit/config-static-env-access.test.ts` - PASS, `4` tests
- `npm run build` - PASS
- `npx playwright test tests/e2e/config-hydration.spec.ts --workers=1` - PASS, `2` tests
- `npm run test` - PASS, `597` tests
- `npm run lint` - PASS, `0` errors, `9` existing warnings
- `npm run typecheck` - PASS
- `npm run build` - PASS
- `npm run test:e2e -- --workers=6` - first run failed in unrelated `document-flow` and `budget` specs; audited config hydration spec passed
- `npx playwright test tests/e2e/document-flow.spec.ts -g "upload salary slip" --workers=1` - PASS
- `npx playwright test tests/e2e/document-flow.spec.ts -g "upload salary slip" --repeat-each=5 --workers=1` - PASS, `5` repeats
- `npx playwright test tests/e2e/budget.spec.ts -g "month navigation moves between months and back to current month" --workers=1` - PASS
- `npm run test:e2e -- --workers=6` - PASS, `83` tests

## Git State

- Only this audit document is intended to be committed in the audit branch.
- No production code, migrations, package files, tests, or configuration files were modified by the audit.
- No migration was applied.
- No push, merge, reset, stash, clean, rebase, force checkout, or production data operation was performed.

## Merge Gate

MERGE GATE: PASS.

Rationale: no blocker/high/medium/low findings remain against the audited fix, the root-cause shape is corrected, security posture is unchanged, and the required verification suite passed after confirming unrelated transient E2E failures independently.
