import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * One axe configuration for both suites.
 *
 * Lifted out of tests/a11y/design-system.spec.ts when the authenticated suite
 * arrived, because two copies of a tag list is how one of them quietly stops
 * checking WCAG 2.2. Not a spec file — Playwright's default testMatch only
 * picks up `*.spec.ts` / `*.test.ts`, so this can live under testDir safely.
 */
export const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Violations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

/** Readable failure output — axe's raw objects are unusable in CI logs. */
export function format(violations: Violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
}

/** Analyse the current page and return the formatted violations (usually `[]`). */
export async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return format(violations);
}
