# Local Validation Guide

This guide covers the standard commands to run locally before opening a Pull Request.

## 1. Confirm Worktree & Branch
Ensure you are on the correct dedicated branch (not `master`) and check for uncommitted changes.

```bash
# Check current branch
git branch --show-current

# Check for untracked or uncommitted files
git status
```

## 2. Unit & Integration Tests (Vitest)
Run focused tests for the logic you changed first, then run the full suite.

```bash
# Focused test (Windows: npx.cmd)
npx vitest run path/to/test.test.ts

# Full suite
npm run test
```

## 3. Linting & Typechecking
Ensure the code follows the project's style and type safety rules.

```bash
# Run linting (Windows: npm.cmd)
npm run lint

# Run typecheck
npm run typecheck
```

## 4. Production Build
Verify that the Next.js production build succeeds.

```bash
npm run build
```

## 5. End-to-End Tests (Playwright)
Run relevant E2E tests if your changes affect the UI, routing, or server actions.

```bash
# Focused E2E test (Windows: npx.cmd)
# Requires E2E_MOCK_AUTH=1 and a fresh build
set E2E_MOCK_AUTH=1
npm run build
npx playwright test tests/focused-test.spec.ts

# Full E2E suite (includes build and mock auth)
npm run test:e2e -- --workers=6
```

## 6. Git Hygiene
Check for trailing whitespace or conflict markers before committing.

```bash
git diff --check
```

## 7. PR Reporting Requirements
In your PR description, you must include:
- **Test Totals**: Report the exact number of passing/failing tests (e.g., `Vitest: 12 passed, 0 failed; Playwright: 8 passed`).
- **Pre-existing Warnings**: Note any warnings that existed before your changes so they aren't attributed to your PR.
- **Commands Used**: List the exact commands you ran to verify the change.

---
*Note: For Windows users, use `npm.cmd` or `npx.cmd` if the standard `npm`/`npx` commands are not in your path, although standard `npm` usually works in most terminals.*
