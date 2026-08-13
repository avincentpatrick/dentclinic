export type AppRole = "patient" | "doctor" | "staff" | "superadmin";

export const ALL_ROLES: readonly AppRole[] = ["patient", "doctor", "staff", "superadmin"] as const;

/** Staff-side roles share the (staff) shell; superadmin can see everything. */
const STAFF_SIDE: readonly AppRole[] = ["staff", "doctor", "superadmin"] as const;

/** Where each role lands after login. */
export const ROLE_HOME: Record<AppRole, string> = {
  patient: "/home",
  doctor: "/today",
  staff: "/today",
  superadmin: "/dashboard",
};

/**
 * The authoritative route table.
 *
 * FAIL-CLOSED: `isAllowed` returns false for anything not listed. The previous
 * version ended in `return true`, which made every route public-by-default —
 * `/design-system` was the first casualty and `/patients`, `/records` would
 * have been next. Adding a route now means adding a line here, and
 * `scripts/check-routes.mjs` fails CI if a real route has no entry.
 *
 * Longest prefix wins, so `/settings/appearance` (public) can sit under a
 * future authenticated `/settings`.
 */
type RouteRule = { prefix: string; roles: readonly AppRole[] | "public" };

export const ROUTE_RULES: readonly RouteRule[] = [
  // Public — no session required.
  { prefix: "/", roles: "public" },
  { prefix: "/login", roles: "public" },
  { prefix: "/auth", roles: "public" },
  { prefix: "/book", roles: "public" }, // guest booking (Phase 4)
  { prefix: "/a/", roles: "public" }, // tokenized email links (Phase 4)
  { prefix: "/settings/appearance", roles: "public" }, // no PHI; guests need text size

  // Patient surfaces. Staff-side roles are deliberately excluded: a doctor
  // hitting /home should land on /today, not a patient dashboard.
  { prefix: "/home", roles: ["patient"] },
  { prefix: "/appointments", roles: ["patient"] },
  { prefix: "/records", roles: ["patient"] },
  // Patients ONLY, not ALL_ROLES: /register calls claim_or_create_patient,
  // a security definer RPC that creates a patient row for auth.uid(). A staff
  // member reaching it would give their own login a chart.
  { prefix: "/register", roles: ["patient"] },
  { prefix: "/profile", roles: ALL_ROLES },

  // Staff + doctor (+ superadmin).
  { prefix: "/today", roles: STAFF_SIDE },
  { prefix: "/schedule", roles: STAFF_SIDE },
  { prefix: "/patients", roles: STAFF_SIDE },
  { prefix: "/availability", roles: ["doctor", "superadmin"] }, // doctor-only (Phase 3)

  // Superadmin only.
  { prefix: "/dashboard", roles: ["superadmin"] },
  { prefix: "/admin", roles: ["superadmin"] },
  { prefix: "/design-system", roles: ["superadmin"] },
];

function matches(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

/** The most specific rule for a path, or undefined if none matches. */
export function ruleFor(pathname: string): RouteRule | undefined {
  let best: RouteRule | undefined;
  for (const rule of ROUTE_RULES) {
    if (matches(pathname, rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  return best;
}

export function isPublicPath(pathname: string): boolean {
  return ruleFor(pathname)?.roles === "public";
}

/** Fail-closed: an unregistered path is denied, never silently public. */
export function isAllowed(pathname: string, role: AppRole | null): boolean {
  const rule = ruleFor(pathname);
  if (!rule) return false;
  if (rule.roles === "public") return true;
  return role !== null && rule.roles.includes(role);
}

export function roleHome(role: AppRole | null): string {
  return role ? ROLE_HOME[role] : "/login";
}
