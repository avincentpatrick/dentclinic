#!/usr/bin/env node
/**
 * Every real route must have an entry in the ROUTE_RULES table.
 *
 * isAllowed() is fail-closed, so an unregistered route is denied rather than
 * silently public — but a denied route is still a bug. This turns "I forgot to
 * register it" into a build failure instead of a 404 someone discovers later.
 *
 * Reads the union Next generates at build time, so it cannot drift from reality.
 * Requires a prior build.
 */
import { readFileSync, existsSync } from "node:fs";

const TYPES = ".next/types/routes.d.ts";

if (!existsSync(TYPES)) {
  console.error(`\n  ${TYPES} not found — run a build first.\n`);
  process.exit(1);
}

const source = readFileSync(TYPES, "utf8");
const match = source.match(/type AppRoutes\s*=\s*([^\n]+)/);
if (!match) {
  console.error("\n  Could not find the AppRoutes union — did Next's type output change?\n");
  process.exit(1);
}

const routes = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((r) => r !== "/_not-found");

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
  missing.forEach((r) => console.error(`    ${r}`));
  console.error(
    `\n  isAllowed() is fail-closed, so these are currently DENIED to everyone.\n` +
      `  Add a rule with the roles that should reach each one.\n`,
  );
  process.exit(1);
}

console.log(`\n  routes: ${routes.length} app routes, all covered by ROUTE_RULES.\n`);
