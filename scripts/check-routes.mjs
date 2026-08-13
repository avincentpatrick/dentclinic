#!/usr/bin/env node
/**
 * Every real route must have an entry in the ROUTE_RULES table.
 *
 * isAllowed() is fail-closed, so an unregistered route is denied rather than
 * silently public — but a denied route is still a bug. This turns "I forgot to
 * register it" into a build failure instead of a 404 someone discovers later.
 *
 * Reads the unions Next generates, so it cannot drift from reality. `next
 * typegen` produces them in a second or two without a full build, which is why
 * `npm run typecheck` runs it first and this can live in the fast `check` gate
 * instead of behind the ~90s OpenNext build.
 *
 * BOTH unions matter. Next emits pages in `AppRoutes` and route handlers in a
 * separate `AppRouteHandlerRoutes`, and until Phase 2 this script read only the
 * first — while the middleware matcher (src/middleware.ts) excludes only
 * _next/* and static extensions, so `/api/*` DOES run middleware and IS subject
 * to fail-closed isAllowed(). A new route handler would therefore 302 to /login
 * in production with CI still green. `/auth/confirm` escaped that only because a
 * `/auth` public rule happens to exist. Phase 5's /api/jobs/send is called by
 * pg_net and would have failed silently.
 */
import { readFileSync, existsSync } from "node:fs";

const TYPES = ".next/types/routes.d.ts";

if (!existsSync(TYPES)) {
  console.error(`\n  ${TYPES} not found — run a build first.\n`);
  process.exit(1);
}

const source = readFileSync(TYPES, "utf8");

/** Returns the quoted members of a `type X = "a" | "b"` union, or null if absent. */
function union(name) {
  const m = source.match(new RegExp(`type ${name}\\s*=\\s*([^\\n]+)`));
  if (!m) return null;
  // `= never` is legitimate (no routes of that kind yet) and yields [].
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const pages = union("AppRoutes");
if (!pages) {
  console.error("\n  Could not find the AppRoutes union — did Next's type output change?\n");
  process.exit(1);
}

// May be `never` before any handler exists, but the union itself must be there —
// if Next ever renames it, silence would be indistinguishable from "no handlers".
const handlers = union("AppRouteHandlerRoutes");
if (!handlers) {
  console.error(
    "\n  Could not find the AppRouteHandlerRoutes union — did Next's type output change?\n" +
      "  Route handlers run through middleware and MUST stay covered.\n",
  );
  process.exit(1);
}

const kind = new Map();
for (const r of pages) kind.set(r, "page");
for (const r of handlers) kind.set(r, "route handler");

const routes = [...kind.keys()].filter((r) => r !== "/_not-found");

// Parse the rule prefixes straight out of the source so there is one source of
// truth. (Importing the module would need a TS loader for a ~10-line regex.)
const rulesSource = readFileSync("src/lib/roles.ts", "utf8");
const prefixes = [...rulesSource.matchAll(/\{\s*prefix:\s*"([^"]+)"/g)].map((m) => m[1]);

if (prefixes.length === 0) {
  console.error("\n  No route rules parsed from src/lib/roles.ts — has ROUTE_RULES changed shape?\n");
  process.exit(1);
}

function covered(route) {
  return prefixes.some((p) => {
    if (p === "/") return route === "/";
    return route === p || route.startsWith(p.endsWith("/") ? p : `${p}/`);
  });
}

const missing = routes.filter((r) => !covered(r));

if (missing.length) {
  console.error(`\n  Routes with no entry in ROUTE_RULES (src/lib/roles.ts):\n`);
  missing.forEach((r) => console.error(`    ${r}  (${kind.get(r)})`));
  console.error(
    `\n  isAllowed() is fail-closed, so these are currently DENIED to everyone.\n` +
      `  Add a rule with the roles that should reach each one.\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Admin hub links must point at routes that exist.
//
// /admin was linked from nav.ts for two whole phases before the page existed,
// so every superadmin who clicked "Clinic settings" got a 404. AdminSectionGrid
// makes an unbuilt section unrepresentable as a link, but nothing checked the
// other direction: that a section WITH an href points somewhere real.
//
// Parsed from source by regex, like ROUTE_RULES above, so this file needs no TS
// loader. Static hrefs only — a dynamic one would be a different check.
// ---------------------------------------------------------------------------
/**
 * Drop comments before matching.
 *
 * Both files below are heavily commented, and nav.ts deliberately keeps a
 * COMMENTED-OUT nav item as the note telling Phase 3 where to put Availability
 * back. Without this, that comment reads as a live link and the check fails on
 * a line that ships nothing — the check crying wolf about its own documentation.
 *
 * Block comments first, then whole-line `//` comments. Only whole-line ones, so
 * a `https://` inside a string is never touched.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const sectionsSource = stripComments(readFileSync("src/lib/admin/sections.ts", "utf8"));
const sectionHrefs = [...sectionsSource.matchAll(/^\s*href:\s*"([^"]+)"/gm)].map((m) => m[1]);

// ---------------------------------------------------------------------------
// ...and so must NAV links.
//
// The dangling-link check above was added in 2.2b for ADMIN_SECTIONS, but the
// bug it was written about happened in nav.ts: `nav.ts` linked "Clinic
// settings" to /admin from the sidebar, the More sheet and the command palette
// for TWO WHOLE PHASES before the page existed, so every superadmin who clicked
// it got a 404. Checking only the hub left the original offender unchecked.
//
// Static hrefs only. `navHref()` may append a `?from=` query string at render
// time; the route is the part before it and is what has to exist.
// ---------------------------------------------------------------------------
const navSource = stripComments(readFileSync("src/lib/shell/nav.ts", "utf8"));
const navHrefs = [...navSource.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

if (navHrefs.length === 0) {
  console.error("\n  No hrefs parsed from src/lib/shell/nav.ts — has NavItem changed shape?\n");
  process.exit(1);
}

const dangling = [
  ...sectionHrefs.filter((href) => !routes.includes(href)).map((h) => [h, "ADMIN_SECTIONS"]),
  ...navHrefs.filter((href) => !routes.includes(href)).map((h) => [h, "nav.ts"]),
];

if (dangling.length) {
  console.error(`\n  Links pointing at routes that do not exist:\n`);
  dangling.forEach(([h, where]) => console.error(`    ${h}  (${where})`));
  console.error(
    `\n  These render as links, so this ships a 404 to whoever clicks one.\n` +
      `  Either build the page, or remove the link — in ADMIN_SECTIONS an absent\n` +
      `  href renders a plain card, which is the point of it being optional.\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// ROUTE_PATTERNS must be exactly the set of real page routes.
//
// It is the closed set `maskPath()` maps a feedback report's `path` onto — rule
// 1 of docs/modules/16-feedback.md, the rule that stops `feedback_reports`
// becoming a log of which patient each staff member viewed. A missing entry
// means reports from that screen silently record no path at all; a stale entry
// means a pattern nothing can produce. Neither fails anywhere else, which is
// why it is asserted here rather than trusted.
//
// Page routes only: a route handler has no UI for anyone to be standing on.
// ---------------------------------------------------------------------------
const patternsSource = readFileSync("src/lib/feedback/path.ts", "utf8");
const patternsBlock = patternsSource.match(/ROUTE_PATTERNS\s*=\s*\[([\s\S]*?)\]\s*as const/);

if (!patternsBlock) {
  console.error("\n  Could not find ROUTE_PATTERNS in src/lib/feedback/path.ts.\n");
  process.exit(1);
}

const patterns = [...patternsBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const realPages = pages.filter((r) => r !== "/_not-found");

const missingPatterns = realPages.filter((r) => !patterns.includes(r));
const extraPatterns = patterns.filter((p) => !realPages.includes(p));

if (missingPatterns.length || extraPatterns.length) {
  console.error(`\n  ROUTE_PATTERNS (src/lib/feedback/path.ts) is out of step with the app:\n`);
  missingPatterns.forEach((r) => console.error(`    missing: ${r}`));
  extraPatterns.forEach((r) => console.error(`    stale:   ${r}`));
  console.error(
    `\n  maskPath() can only ever return a member of that list, so a missing route\n` +
      `  means feedback filed from it records no screen at all.\n`,
  );
  process.exit(1);
}

console.log(
  `\n  routes: ${pages.length} pages + ${handlers.length} route handlers, ` +
    `all covered by ROUTE_RULES;\n  ${sectionHrefs.length} admin links + ${navHrefs.length} nav links resolve; ` +
    `${patterns.length} route patterns in sync.\n`,
);
