import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for the exact bug class that caused a deterministic SSR
// hydration mismatch: `src/lib/supabase/config.ts` used to read
// NEXT_PUBLIC_* variables via `process.env[key]` where `key` came from a
// loop/array of key names. Next.js's build-time env inlining
// (webpack/Turbopack DefinePlugin) can only statically rewrite literal
// `process.env.NEXT_PUBLIC_X` member-expression accesses into the client
// bundle -- a variable-keyed lookup is invisible to that step, so the
// browser's `process.env` stayed empty for those keys at runtime while the
// server (real Node.js env) saw the actual values. That divergence made
// ConfigError render two different trees during hydration on any route
// where AppShell is reachable from a "use client" component.
//
// A plain vitest/jsdom unit test cannot reproduce this directly -- vitest
// runs in real Node.js with a real `process.env`, never through Next.js's
// bundler, so `process.env[key]` "works" there regardless of whether it
// would be safely inlined in an actual client bundle. This test instead
// asserts the exact source-code shape the fix requires: every NEXT_PUBLIC_*
// read in this file must be a static, literal `process.env.NEXT_PUBLIC_X`
// expression, and the file must never contain a variable-keyed
// `process.env[...]` access at all.

const configSourceRaw = readFileSync(
  join(process.cwd(), "src/lib/supabase/config.ts"),
  "utf8",
);

// Strip comments before scanning for the forbidden pattern -- the file's
// own explanatory comments legitimately mention `process.env[key]` as
// prose describing what NOT to do, which must not itself trip this guard.
const configSource = configSourceRaw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("Supabase public config uses only statically inlinable process.env access", () => {
  it("never accesses process.env with a variable/bracket key", () => {
    // Matches `process.env[` followed by anything that is NOT a
    // double-quoted literal string starting immediately after the bracket
    // (a literal like process.env["NEXT_PUBLIC_X"] would still be safe and
    // is not what we're guarding against here -- but this file should not
    // use bracket access at all, so any `process.env[` is a violation).
    expect(configSource).not.toMatch(/process\.env\[/);
  });

  it("never loops over an array of env-var key names to read them", () => {
    // The specific pattern that caused the regression: an array of key
    // names consumed via `.filter`/`for...of`/`.find` with `process.env[key]`
    // inside. Guard against the array-of-key-names shape reappearing even
    // if the exact loop construct changes.
    expect(configSource).not.toMatch(/publicKeyOptions|publicRequired/);
  });

  it("reads each required NEXT_PUBLIC_* variable via a static literal expression", () => {
    expect(configSource).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(configSource).toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(configSource).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("never references the server-only service-role key in this public-config module", () => {
    expect(configSource).not.toContain("SERVICE_ROLE");
  });
});
