import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output — generated bundles, not source. Present locally after a
    // build; absent in CI, which is why this gap went unnoticed in Phase 0.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
