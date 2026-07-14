import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Nine spec files (tests/e2e/helpers/pipeline-lock.ts) share one global
  // lock to serialize document/import-processing tests. With multiple
  // Playwright workers (AGENTS.md runs --workers=6), several of those
  // tests can start their beforeEach at nearly the same moment and queue
  // for the lock -- Playwright's 30s default test/hook timeout was
  // shorter than that legitimate queueing burst could take, independent
  // of the pipeline lock's own (much longer) internal wait budget, and
  // was the actual cause of "Test timeout of 30000ms exceeded while
  // running beforeEach hook" CI failures. A genuinely hung test still
  // fails, just after a more realistic budget instead of a spuriously
  // short one.
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:3011",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3011",
    url: "http://127.0.0.1:3011",
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      E2E_MOCK_AUTH: "1",
    },
  },
});
