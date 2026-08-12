/**
 * Appearance preferences — shared vocabulary for middleware, server, and client.
 *
 * Deliberately imports nothing from `next/headers` or `next/server`: middleware
 * (edge), Server Components, and Client Components all pull from this module.
 *
 * Cookies are the runtime source of truth (SSR-correct first paint, no flash).
 * `public.user_preferences` is the cross-device mirror, reconciled once per
 * browser session in middleware — see docs/modules/02-clinic-settings.md.
 */

export type Theme = "light" | "dark" | "system";

/** What the user picked. `auto` defers to the route. */
export type FontPref = "auto" | "standard" | "comfortable" | "large" | "xlarge";

/** What actually lands on <html data-font-size>. Never `auto`. */
export type FontStep = "standard" | "comfortable" | "large" | "xlarge";

export const THEMES: readonly Theme[] = ["light", "dark", "system"] as const;
export const FONT_PREFS: readonly FontPref[] = ["auto", "standard", "comfortable", "large", "xlarge"] as const;
export const FONT_STEPS: readonly FontStep[] = ["standard", "comfortable", "large", "xlarge"] as const;

export const THEME_COOKIE = "dc_theme";
export const FONT_COOKIE = "dc_font";
/** Holds the user id whose DB preferences were merged this session. */
export const SYNC_COOKIE = "dc_prefsync";

export const DEFAULT_THEME: Theme = "system";
export const DEFAULT_FONT_PREF: FontPref = "auto";

/** Human labels — used by AppearancePanel and the design-system gallery. */
export const FONT_STEP_LABELS: Record<FontStep, string> = {
  standard: "Standard",
  comfortable: "Comfortable",
  large: "Large",
  xlarge: "Extra large",
};

export const FONT_STEP_PERCENT: Record<FontStep, string> = {
  standard: "100%",
  comfortable: "112.5%",
  large: "125%",
  xlarge: "137.5%",
};

/**
 * HttpOnly: the client never reads these — the server passes current values to
 * AppearanceProvider as props and all writes go through a server action. That
 * keeps us consistent with the "preferences server-side, never localStorage"
 * rule and removes a whole class of cookie/DOM drift.
 *
 * SameSite=Lax, not Strict: patients arrive via tokenized email links
 * (`/a/[token]`, Phase 4). Strict would withhold the cookie on that cross-site
 * entry and flash the wrong theme on the most important patient flow.
 */
export const APPEARANCE_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
} as const;

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

export function parseFontPref(value: unknown): FontPref {
  return FONT_PREFS.includes(value as FontPref) ? (value as FontPref) : DEFAULT_FONT_PREF;
}

/**
 * Patient-facing surfaces default to 112.5% (18px) for health literacy.
 *
 * Pathname-based, NOT role-based, and that is load-bearing: `/book` and
 * `/a/[token]` are patient-facing with no session at all, so a role check would
 * serve guest booking at 100%.
 */
export const PATIENT_SURFACES = ["/home", "/appointments", "/records", "/profile", "/book", "/a/"] as const;

export function isPatientSurface(pathname: string): boolean {
  return PATIENT_SURFACES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * An explicit choice wins on every route, for every role — a doctor who picks
 * `large` keeps it on /today, a patient who picks `standard` keeps it on /home.
 * Route defaults only fill an unset preference, which is why `auto` has to
 * exist as a distinct value rather than seeding the cookie on first visit.
 */
export function resolveFontStep(pref: FontPref, pathname: string): FontStep {
  if (pref !== "auto") return pref;
  return isPatientSurface(pathname) ? "comfortable" : "standard";
}
