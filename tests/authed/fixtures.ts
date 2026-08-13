import type { AppRole } from "../../src/lib/roles";

/**
 * Shared constants for the authenticated suite.
 *
 * Imported by playwright.config.ts as well as the specs, so it must stay free
 * of Playwright imports and side effects.
 */

/**
 * Where storage states and resolved ids land.
 *
 * A storageState file contains a LIVE Supabase refresh token. AGENTS.md's
 * "no working credential in a tracked file, ever" applies to it exactly as it
 * applies to .env.local, so this directory is git-ignored — and it is named
 * here, once, rather than spelled out at each write site.
 */
export const AUTH_DIR = "playwright/.auth";
export const FIXTURE_IDS_FILE = `${AUTH_DIR}/fixture-ids.json`;

export function storageStatePath(role: AppRole): string {
  return `${AUTH_DIR}/${role}.json`;
}

/**
 * The roles minted by auth.setup.ts.
 *
 * Superadmin reaches every admin surface (all 11 lookups routes, branding, the
 * hub) and every staff-side one; patient reaches the patient surfaces and is
 * the role the cross-role denial assertions are written against. Doctor and
 * staff add a third shell variant and can be appended here without any other
 * change — the cost is one more browser context per run, against a deliberate
 * 2–4 worker cap.
 */
export const FIXTURE_ROLES = ["superadmin", "patient"] as const satisfies readonly AppRole[];

export type FixtureRole = (typeof FIXTURE_ROLES)[number];

/** One real id per dynamic route, resolved once in setup. */
export type FixtureIds = {
  patientId: string | null;
  appointmentTypeId: string | null;
  operatoryId: string | null;
  lookupValueId: string | null;
  lookupCategorySlug: string | null;
  feedbackReportId: string | null;
};

/**
 * The env var that gates the whole suite.
 *
 * Nothing in the test path loads .env.local, so this is absent by default and
 * `npm run verify` stays offline and unchanged. `npm run test:authed` supplies
 * it via `node --env-file`.
 */
export const GATE_ENV_VAR = "SUPABASE_SERVICE_ROLE_KEY";

export function authedSuiteEnabled(): boolean {
  return Boolean(process.env[GATE_ENV_VAR] && process.env.NEXT_PUBLIC_SUPABASE_URL);
}
