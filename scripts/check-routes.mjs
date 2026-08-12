#!/usr/bin/env node
/**
 * Every real route must have an entry in the ROUTE_RULES table.
 *
 * isAllowed() is fail-closed, so an unregistered route is denied rather than
 * silently public — but a denied route is still a bug. This turns "I forgot to
 * register it" into a build failure instead of a 404 someone discovers later.
 *
 * Reads the unions Next generates at build time, so it cannot drift from reality.
 * Requires a prior build.
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

console.log(
  `\n  routes: ${pages.length} pages + ${handlers.length} route handlers, ` +
    `all covered by ROUTE_RULES.\n`,
);
