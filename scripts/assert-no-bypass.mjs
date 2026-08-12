#!/usr/bin/env node
/**
 * Refuse to deploy an artifact built with the a11y audit bypass enabled.
 *
 * Belt and braces: the bypass is read at RUNTIME in a Server Component and
 * A11Y_AUDIT is not in wrangler.jsonc vars, so it cannot be on in production
 * anyway. This makes the guarantee explicit at the one moment it matters.
 */
if (process.env.A11Y_AUDIT === "1") {
  console.error(
    "\n  REFUSING TO DEPLOY: A11Y_AUDIT=1 is set in this environment.\n" +
      "  That flag opens /design-system without a session. Unset it and retry.\n",
  );
  process.exit(1);
}
