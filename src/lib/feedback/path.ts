/**
 * Turn a submitted path into a ROUTE PATTERN, or into nothing.
 *
 * THIS IS RULE 1 OF docs/modules/16-feedback.md, and the module doc calls it
 * "the single most important rule". A feedback report captures where the
 * reporter was. If that were stored as a real path, `feedback_reports` would
 * quietly become a log of WHICH PATIENT EACH STAFF MEMBER VIEWED AND WHEN,
 * readable by the superadmin from an ordinary admin screen — outside
 * `private.audit_log`, which exists to control exactly that access and has its
 * own retention rules.
 *
 * So this is not a sanitiser. A sanitiser is a function that can be wrong: miss
 * a case, mishandle an encoding, and a uuid survives. This maps the input onto
 * a CLOSED SET and returns a member of that set or `null` — the id is not
 * removed from the string, the string is discarded and replaced by the pattern
 * it matched. There is no path through here that returns caller-controlled
 * text.
 *
 * The set is `ROUTE_PATTERNS` below, and it cannot drift from reality:
 * `scripts/check-routes.mjs` asserts it set-equals the `AppRoutes` union Next
 * generates, in the fast `check` gate. Add a route without adding it here and
 * `npm run check` fails.
 *
 * A second, independent layer sits under this one — the
 * `feedback_reports_path_masked` CHECK in migration 0015 — because this
 * function protects the SERVER ACTION and any signed-in user can POST straight
 * to PostgREST.
 */

/**
 * Every route in the app, as Next names it.
 *
 * Kept in the same order Next emits so a diff against the generated union is
 * readable. Route GROUPS are not part of a URL and never appear here.
 */
export const ROUTE_PATTERNS = [
  "/",
  "/admin",
  "/admin/branding",
  "/admin/feedback",
  "/admin/feedback/[id]",
  "/admin/lookups",
  "/admin/lookups/[category]",
  "/admin/lookups/[category]/[id]",
  "/admin/lookups/[category]/new",
  "/admin/lookups/appointment-types",
  "/admin/lookups/appointment-types/[id]",
  "/admin/lookups/appointment-types/new",
  "/admin/lookups/operatories",
  "/admin/lookups/operatories/[id]",
  "/admin/lookups/operatories/new",
  "/appointments",
  "/book",
  "/dashboard",
  "/design-system",
  "/feedback",
  "/home",
  "/login",
  "/patients",
  "/patients/[id]",
  "/patients/[id]/edit",
  "/patients/new",
  "/profile",
  "/records",
  "/register",
  "/schedule",
  "/settings/appearance",
  "/today",
] as const;

export type RoutePattern = (typeof ROUTE_PATTERNS)[number];

const isPlaceholder = (segment: string): boolean =>
  segment.startsWith("[") && segment.endsWith("]");

/** Split a pattern or path into segments, with the root as an empty list. */
function segmentsOf(path: string): string[] {
  return path.split("/").filter(Boolean);
}

const PATTERN_SEGMENTS: readonly (readonly string[])[] = ROUTE_PATTERNS.map(segmentsOf);

/**
 * The pattern this path corresponds to, or `null` if it is not a route.
 *
 * `null` rather than a placeholder string like "/unknown": a report that could
 * not be attributed to a screen should SAY so, and a fake path that looks real
 * is worse than an empty column. `feedback_reports.path` is nullable for this.
 *
 * Input is untrusted. It may be a full URL, may carry a query string or
 * fragment, may be percent-encoded, may have duplicate or trailing slashes, and
 * may be hand-crafted by someone trying to get an id into the table.
 */
export function maskPath(raw: string | null | undefined): RoutePattern | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  // A cheap ceiling before any parsing: no real route is anywhere near this,
  // and it bounds the work an attacker can ask for.
  if (raw.length > 512) return null;

  let pathname = raw;

  // Accept a full URL, but take ONLY its pathname. Same-origin is not checked
  // because the value is thrown away either way — what matters is that the
  // query string and fragment are dropped here rather than trimmed later.
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathname) || pathname.startsWith("//")) {
    try {
      pathname = new URL(pathname, "http://x").pathname;
    } catch {
      return null;
    }
  }

  pathname = pathname.split("#")[0].split("?")[0];

  // Decode BEFORE matching, so `%5Bid%5D` and a percent-encoded separator
  // cannot smuggle a segment past the comparison. A malformed escape is a
  // rejection, not a best effort.
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const segments = segmentsOf(pathname);
  if (segments.length === 0) return "/";

  // Score rather than first-match: `/admin/lookups/appointment-types` and
  // `/admin/lookups/[category]` both have three segments and both match, and
  // the static one is the right answer. Highest count of literal matches wins.
  let best: RoutePattern | null = null;
  let bestScore = -1;

  for (let i = 0; i < ROUTE_PATTERNS.length; i++) {
    const pattern = PATTERN_SEGMENTS[i];
    if (pattern.length !== segments.length) continue;

    let score = 0;
    let matched = true;
    for (let s = 0; s < pattern.length; s++) {
      if (pattern[s] === segments[s]) score++;
      else if (!isPlaceholder(pattern[s])) {
        matched = false;
        break;
      }
    }

    if (matched && score > bestScore) {
      bestScore = score;
      best = ROUTE_PATTERNS[i];
    }
  }

  return best;
}
