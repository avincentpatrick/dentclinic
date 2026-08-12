import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/a11y",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
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
