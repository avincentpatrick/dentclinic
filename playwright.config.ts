import os from "node:os";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/a11y",
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
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Exercises BottomTabBar + safe areas rather than the sidebar.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
