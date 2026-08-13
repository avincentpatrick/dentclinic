import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test as setup } from "@playwright/test";
import { ROLE_HOME } from "../../src/lib/roles";
import { AUTH_DIR, FIXTURE_IDS_FILE, FIXTURE_ROLES, storageStatePath, type FixtureIds } from "./fixtures";

/**
 * Mint a real session per role, once, and save it as a storageState file.
 *
 * WHY THIS EXISTS. Phase 2.2b shipped six routes that returned 500 to every
 * superadmin who opened them, past a fully green `npm run verify` — because
 * lint, typecheck, check:routes and 32 axe tests all pass without ever
 * rendering an authenticated page (PROGRESS decision 22). 06-accessibility.md
 * has carried this fixture as "the tracked next step" since 2.2a, in exactly
 * this shape: service-role generateLink → storageState, skipped unless its env
 * var is set so `npm run verify` stays offline.
 *
 * WHY NOT HAND-FORGED COOKIES. 06-accessibility.md called authenticating
 * Playwright "fragile and slow" on the assumption that it needed hand-forged
 * chunked `sb-*-auth-token` cookies. It does not: `/auth/confirm` is already a
 * public route handler that calls `verifyOtp` on a `token_hash`
 * (src/app/auth/confirm/route.ts), so replaying an admin-generated link at the
 * app makes THE APP mint its own session, with its own cookie chunking and its
 * own middleware pass. Nothing here knows how Supabase stores a session, which
 * is what keeps it from breaking when that changes.
 *
 * `type: "magiclink"` is deliberate over `invite`/`signup`: it FAILS if the
 * user does not exist rather than silently creating one, so a typo in a seeded
 * address is a red test instead of a new row in auth.users.
 *
 * These sessions are real. Everything the authed suite does with them is
 * read-only navigation — see routes.spec.ts.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * A hard failure, not a skip.
 *
 * playwright.config.ts omits this project entirely when the key is absent, so
 * reaching this line means the project was registered and the key vanished
 * afterwards. Skipping there would leave the dependent suite running against a
 * missing storageState, which fails later and less legibly.
 */
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "auth.setup.ts requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
      "Run `npm run test:authed`, which loads .env.local.",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Base for `new URL()` only — the confirm handler's Location may be absolute or
 * relative depending on where it ran, and this makes both parse to a pathname.
 * Never used to make a request.
 */
const BASE_FOR_PARSE = "http://127.0.0.1";

for (const role of FIXTURE_ROLES) {
  setup(`authenticate as ${role}`, async ({ page, context }) => {
    // Seeded in Phase 0 and documented in docs/modules/01-auth-roles.md. The
    // password for these accounts lives only in .env.local; this path never
    // uses it — an admin-generated link needs no credential from the test.
    const email = `test-${role}@example.com`;

    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw new Error(`generateLink failed for ${email}: ${error.message}`);

    const tokenHash = data.properties?.hashed_token;
    if (!tokenHash) throw new Error(`generateLink returned no hashed_token for ${email}`);

    // DO NOT let the browser follow this redirect. Measured on the standalone
    // server: a ROUTE HANDLER's NextResponse.redirect serialises as an ABSOLUTE
    // url whose host is `localhost`, while middleware's serialises relative:
    //
    //   /auth/confirm  ->  307  location: http://localhost:3100/
    //   /home          ->  307  location: /login
    //
    // baseURL here is 127.0.0.1, so following that hop crosses an ORIGIN. The
    // session cookie is set correctly on 127.0.0.1 and then simply is not sent
    // to localhost, so the next request is anonymous and lands on the public
    // landing page — which looks exactly like "the token was rejected" and is
    // not. Production never sees this: on Workers the incoming request URL is
    // absolute with the real host, which is why magic-link login has always
    // worked live (verified in 0.2).
    //
    // `page.request` shares this context's cookie jar, so the Set-Cookie still
    // lands where `page` will use it.
    const confirmed = await page.request.get(
      `/auth/confirm?token_hash=${tokenHash}&type=magiclink`,
      { maxRedirects: 0 },
    );

    // Distinguishes "verifyOtp succeeded" from "link-expired": the handler
    // redirects to "/" on success and to /login?error=link-expired on failure,
    // both with 307, so the STATUS alone proves nothing and the location is
    // what carries the answer.
    const location = confirmed.headers()["location"] ?? "";
    expect(new URL(location, BASE_FOR_PARSE).pathname, `confirm rejected the link for ${email}`).toBe("/");

    // THE assertion that proves the session is real AND the claim is right.
    // Middleware sends a signed-in visitor from "/" to their own ROLE_HOME, so
    // landing there means the cookie persisted, was replayed, and
    // custom_access_token_hook put the expected user_role in the JWT. A wrong
    // role lands somewhere else and fails here.
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe(ROLE_HOME[role]);

    await context.storageState({ path: storageStatePath(role) });
  });
}

/**
 * Resolve one real id per dynamic route.
 *
 * Without this the suite would cover only static routes — and FOUR of 2.2b's
 * six 500s were `/[id]` routes. Read with the service-role client rather than
 * by scraping the roster, so a broken list page cannot quietly reduce the
 * dynamic coverage to nothing.
 */
setup("resolve fixture ids for dynamic routes", async () => {
  const [patients, types, operatories, values, reports] = await Promise.all([
    admin.from("patients").select("id").is("deleted_at", null).limit(1),
    admin.from("appointment_types").select("id").is("deleted_at", null).limit(1),
    admin.from("operatories").select("id").is("deleted_at", null).limit(1),
    admin
      .from("lookup_values")
      .select("id, lookup_categories!inner(key)")
      .is("deleted_at", null)
      .limit(1),
    admin.from("feedback_reports").select("id").is("deleted_at", null).limit(1),
  ]);

  const value = values.data?.[0] as { id: string; lookup_categories: { key: string } } | undefined;

  const ids: FixtureIds = {
    patientId: patients.data?.[0]?.id ?? null,
    appointmentTypeId: types.data?.[0]?.id ?? null,
    operatoryId: operatories.data?.[0]?.id ?? null,
    lookupValueId: value?.id ?? null,
    // /admin/lookups/[category] is slugged, not keyed — keyToSlug in
    // src/lib/lookups/query.ts owns that mapping.
    lookupCategorySlug: value?.lookup_categories.key.replace(/_/g, "-") ?? null,
    // Requires at least one filed report to exist. That is deliberate rather
    // than incidental: the 2.2d acceptance is "a filed report reaches
    // /admin/feedback with its path masked", so a database with none is a
    // database where that acceptance has not been demonstrated.
    feedbackReportId: reports.data?.[0]?.id ?? null,
  };

  // An id that came back null means the seed is gone, which would silently
  // shrink coverage. Fail here instead, where the cause is obvious.
  const missing = Object.entries(ids)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  expect(missing, "seeded rows missing — dynamic routes would be skipped").toEqual([]);

  mkdirSync(dirname(FIXTURE_IDS_FILE), { recursive: true });
  writeFileSync(FIXTURE_IDS_FILE, JSON.stringify(ids, null, 2));
  console.log(`  fixture ids written to ${FIXTURE_IDS_FILE} (${AUTH_DIR} is git-ignored)`);
});
