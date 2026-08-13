import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { axeViolations } from "../helpers/axe";
import { FIXTURE_IDS_FILE, storageStatePath, type FixtureIds } from "./fixtures";

/**
 * Every authenticated route, rendered by a real session.
 *
 * THE BUG THIS EXISTS FOR: 2.2b's six create/edit routes returned 500 to every
 * superadmin who opened them while `npm run verify` was green, because a render
 * prop cannot cross the Server→Client boundary and no gate rendered an
 * authenticated page (PROGRESS decision 22). A 500 from a Next page renders no
 * <h1>, so "status is 200 AND exactly one non-empty <h1>" is the assertion that
 * catches that entire class.
 *
 * READ-ONLY. Nothing here submits a form, and no route in the lists below
 * mutates on GET. One honest side effect, recorded rather than hidden: the
 * patient roster and detail pages call `log_read`, so each run appends `read`
 * rows to private.audit_log attributed to test-superadmin@example.com. Those
 * rows are TRUE — a real session really did open the roster — and they are
 * attributable, which is the property the log exists for. The seeded test users
 * are slated for removal before real launch (01-auth-roles.md).
 *
 * Route names in test titles are the PATTERN (`/patients/[id]`), not the
 * concrete id, so the report is stable across runs and across databases.
 */

type SmokeRoute = {
  /** Stable name for the test title. */
  pattern: string;
  /** Concrete path to visit. Dynamic routes build theirs from the resolved ids. */
  build: (ids: FixtureIds) => string;
  /**
   * Where the browser should END UP. Defaults to the visited path — asserting
   * it catches a guard that bounces a role off a route it is entitled to.
   */
  landsOn?: string;
  /**
   * Opt out of the landing assertion for routes that legitimately redirect
   * depending on data. The 200 + <h1> check still applies.
   */
  mayRedirect?: boolean;
};

const at = (pattern: string, extra: Partial<SmokeRoute> = {}): SmokeRoute => ({
  pattern,
  build: () => pattern,
  ...extra,
});

const SUPERADMIN_ROUTES: SmokeRoute[] = [
  at("/dashboard"),
  at("/today"),
  at("/schedule"),
  at("/profile"),
  at("/admin"),
  at("/admin/branding"),
  at("/admin/lookups"),
  at("/admin/feedback"),
  at("/feedback"),
  at("/patients"),
  at("/patients/new"),

  // The six that 500'd in 2.2b. These are the reason this file exists.
  at("/admin/lookups/appointment-types"),
  at("/admin/lookups/appointment-types/new"),
  at("/admin/lookups/operatories"),
  at("/admin/lookups/operatories/new"),
  {
    pattern: "/admin/lookups/appointment-types/[id]",
    build: (ids) => `/admin/lookups/appointment-types/${ids.appointmentTypeId}`,
  },
  {
    pattern: "/admin/lookups/operatories/[id]",
    build: (ids) => `/admin/lookups/operatories/${ids.operatoryId}`,
  },
  {
    pattern: "/admin/lookups/[category]",
    build: (ids) => `/admin/lookups/${ids.lookupCategorySlug}`,
  },
  {
    pattern: "/admin/lookups/[category]/new",
    build: (ids) => `/admin/lookups/${ids.lookupCategorySlug}/new`,
  },
  {
    pattern: "/admin/lookups/[category]/[id]",
    build: (ids) => `/admin/lookups/${ids.lookupCategorySlug}/${ids.lookupValueId}`,
  },
  {
    pattern: "/admin/feedback/[id]",
    build: (ids) => `/admin/feedback/${ids.feedbackReportId}`,
  },
  { pattern: "/patients/[id]", build: (ids) => `/patients/${ids.patientId}` },
  { pattern: "/patients/[id]/edit", build: (ids) => `/patients/${ids.patientId}/edit` },
];

const PATIENT_ROUTES: SmokeRoute[] = [
  at("/home"),
  at("/feedback"),
  at("/appointments"),
  at("/records"),
  at("/profile"),
  // Redirects to /home when this login already has a patient record, which
  // depends on the seed rather than on the code being correct.
  at("/register", { mayRedirect: true }),
];

function readIds(): FixtureIds {
  return JSON.parse(readFileSync(FIXTURE_IDS_FILE, "utf8")) as FixtureIds;
}

for (const [role, routes] of [
  ["superadmin", SUPERADMIN_ROUTES],
  ["patient", PATIENT_ROUTES],
] as const) {
  test.describe(`${role} routes`, () => {
    test.use({ storageState: storageStatePath(role) });

    for (const route of routes) {
      test(`renders ${route.pattern}`, async ({ page }) => {
        const path = route.build(readIds());

        const response = await page.goto(path);

        // Read the STATUS off the response object. PROGRESS decision 25 exists
        // because `(await page.goto(…)) && true` is always truthy: an assertion
        // that cannot fail reads as coverage in the report while proving
        // nothing.
        expect(response, `no response for ${path}`).not.toBeNull();
        expect(response!.status(), `HTTP status for ${path}`).toBe(200);

        if (!route.mayRedirect) {
          expect(new URL(page.url()).pathname, `landed elsewhere from ${path}`).toBe(
            route.landsOn ?? path,
          );
        }

        // A 500 renders Next's error page, which has no <h1> from PageHeader.
        // "Exactly one" also holds the a11y rule that a route has a single h1.
        const h1 = page.locator("h1");
        await expect(h1).toHaveCount(1);
        await expect(h1).not.toBeEmpty();

        expect(await axeViolations(page)).toEqual([]);
      });
    }
  });
}

/**
 * The other direction: routes a role must NOT reach.
 *
 * `isAllowed()` is fail-closed and unit-obvious, but nothing has ever proven
 * the middleware wiring end to end — that a wrong-role request is redirected to
 * the caller's own home rather than 404ing (which would leak route existence)
 * or, worse, rendering.
 */
test.describe("cross-role denial", () => {
  test.describe("patient", () => {
    test.use({ storageState: storageStatePath("patient") });

    for (const path of [
      "/admin",
      "/admin/branding",
      "/admin/lookups",
      "/admin/feedback",
      "/patients",
      "/dashboard",
    ]) {
      test(`patient is redirected away from ${path}`, async ({ page }) => {
        await page.goto(path);
        expect(new URL(page.url()).pathname).toBe("/home");
      });
    }
  });

  test.describe("superadmin", () => {
    test.use({ storageState: storageStatePath("superadmin") });

    // Patient surfaces exclude staff-side roles deliberately (roles.ts): a
    // superadmin hitting /home lands on /dashboard, not a patient dashboard.
    for (const path of ["/home", "/appointments", "/records", "/register"]) {
      test(`superadmin is redirected away from ${path}`, async ({ page }) => {
        await page.goto(path);
        expect(new URL(page.url()).pathname).toBe("/dashboard");
      });
    }
  });
});
