import os from "node:os";
import { defineConfig, devices, type Project } from "@playwright/test";
import { authedSuiteEnabled, GATE_ENV_VAR } from "./tests/authed/fixtures";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * The authenticated suite is OPT-IN, and deliberately so.
 *
 * It needs a service-role key to mint sessions, which means it needs the
 * network and a real Supabase project. `npm run verify` claims to be "CI,
 * offline" and that claim is load-bearing — it is the only gate standing
 * between a regression and the deployed URL. So nothing in the test path loads
 * .env.local, the key is absent by default, and these projects simply are not
 * registered. `npm run test:authed` supplies it explicitly.
 *
 * The announcement below is not decoration. PROGRESS decision 25's lesson is
 * that a gate which silently does not run is worse than no gate, because its
 * absence looks like a pass — so the omission says so out loud, every time.
 */
const authedProjects: Project[] = authedSuiteEnabled()
  ? [
      {
        name: "authed-setup",
        testDir: "tests/authed",
        testMatch: /auth\.setup\.ts/,
        use: { ...devices["Desktop Chrome"] },
      },
      {
        name: "authed",
        testDir: "tests/authed",
        testMatch: /.*\.spec\.ts/,
        dependencies: ["authed-setup"],
        // No storageState here: routes.spec.ts selects one per describe block,
        // because the cross-role denial checks need two roles in one file.
        use: { ...devices["Desktop Chrome"] },
      },
    ]
  : [];

if (authedProjects.length === 0) {
  console.log(
    `\n  authenticated route suite NOT RUNNING — ${GATE_ENV_VAR} is not set.\n` +
      `  This is the default and keeps \`npm run verify\` offline.\n` +
      `  Run \`npm run test:authed\` to exercise authenticated routes.\n`,
  );
}

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  /**
   * Capped because Playwright's default is 50% of CORES and takes no account of
   * MEMORY. On a 22-core dev box that is 11 concurrent Chromium instances, and
   * the axe matrix pages are heavy: with the machine otherwise busy the whole
   * run dies as `worker process exited unexpectedly (code=3221226505)` plus
   * "Target crashed" — every test failing at once, which reads like an a11y
   * regression and is really the OS refusing to start another browser.
   *
   * That is the same 0xC0000409 that made the Next build look flaky, and the
   * same lesson as PROGRESS.md's 2026-08-13 note about attributing an
   * intermittent native crash to a component after one sample. A gate that
   * fails on memory pressure is a gate that gets ignored.
   *
   * So it is scaled by FREE MEMORY with a floor of 2 and a ceiling of 4 —
   * roughly 1.5 GB per Chromium, which is what the crashes measured. The suite
   * is ~30 short tests, so even 2 workers finishes in about a minute; there is
   * nothing to buy by pushing it higher. Same shape as
   * `experimental.memoryBasedWorkersCount` in next.config.ts, for the same
   * reason.
   */
  workers: Math.max(2, Math.min(4, Math.floor(os.freemem() / 1.5e9))),
  webServer: {
    command: "node scripts/serve-standalone.mjs",
    // A public route, so readiness is an unambiguous 200 rather than a redirect.
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: {
      // Opens /design-system to the audit without a session. Runtime-only and
      // never set on the deployed Worker — see src/app/design-system/layout.tsx
      // and scripts/assert-no-bypass.mjs.
      A11Y_AUDIT: "1",
      PORT: String(PORT),
    },
  },
  use: { baseURL: BASE_URL },
  projects: [
    // testDir is pinned per project so the a11y projects keep exactly the scope
    // they had before tests/authed existed — otherwise both of them would also
    // run the authenticated specs, twice, against the 2–4 worker cap.
    { name: "desktop", testDir: "tests/a11y", use: { ...devices["Desktop Chrome"] } },
    // Exercises BottomTabBar + safe areas rather than the sidebar.
    { name: "mobile", testDir: "tests/a11y", use: { ...devices["Pixel 7"] } },
    ...authedProjects,
  ],
});
