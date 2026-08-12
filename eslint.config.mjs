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
  {
    // Underscore-prefixed args are an intentional "unused on purpose" marker —
    // used by the Phase 3/6 seams in src/lib/status/derive.ts.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The gallery is the one route with an audit bypass. Keeping it to
    // hard-coded fixtures makes the blast radius zero by construction rather
    // than by discipline. layout.tsx is excluded: it IS the gate and
    // legitimately needs Supabase.
    files: ["src/components/gallery/**", "src/app/design-system/page.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/*", "**/lib/supabase/*", "@/app/actions/*"],
              message:
                "The /design-system gallery must render hard-coded fixtures only — never real data or server actions. See docs/design-system/06-accessibility.md.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
