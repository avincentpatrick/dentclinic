import { httpsUrl, intInRange, optional, required, type Schema } from "@/lib/forms/validation";

/**
 * Branding field list, bounds, and the pure helpers around them.
 *
 * SERVER-FREE ON PURPOSE, for two separate reasons:
 *
 *   1. A `"use server"` module may only export async functions, so the field
 *     tuple and the schema cannot live in `src/app/actions/settings.ts`. Same
 *     constraint, same solution as `src/lib/patients/schema.ts`.
 *   2. `@/lib/branding` reaches `next/headers` transitively (via the Supabase
 *      server client and `next/cache`), so a Client Component importing
 *      `normalizeHue` from there fails the build. BrandingForm needs
 *      `hueName()` and the bounds, so the pure half lives here and
 *      `@/lib/branding` re-exports it for existing server-side callers.
 *
 * The bounds below are duplicated in `public.update_clinic_branding`
 * (migration 0010). forms.md is explicit that client and server bounds must
 * agree: when they drift, the database rejects what the form accepted and the
 * resulting error has no field to attach itself to.
 */

export const BRANDING_FIELDS = ["clinic_name", "tagline", "logo_url", "brand_hue"] as const;
export type BrandingField = (typeof BRANDING_FIELDS)[number];

export const CLINIC_NAME_MAX = 80;
export const TAGLINE_MAX = 160;
export const LOGO_URL_MAX = 500;
export const BRAND_HUE_MIN = 0;
export const BRAND_HUE_MAX = 359;

export const DEFAULT_BRAND_HUE = 195;
export const DEFAULT_CLINIC_NAME = "DentClinic";

export type Branding = {
  clinicName: string;
  tagline: string | null;
  logoUrl: string | null;
  brandHue: number;
};

/** Mirrors migration 0011's bucket configuration. Kept in step by hand. */
export const LOGO_BUCKET = "branding";
export const LOGO_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 1_048_576;
export const LOGO_ACCEPT = LOGO_MIME.join(",");

/**
 * Normalising into [0, 360) is a security control, not hygiene: the result is
 * interpolated into an inline `style` attribute on <html> (src/app/layout.tsx)
 * and originates in a database row a superadmin can now edit.
 *
 * Kept even though 0010 rejects out-of-range writes, because the two do
 * different jobs and the pairing is deliberate: the WRITE path rejects, so a
 * bad value is reported to whoever produced it; the READ path normalises, so a
 * row that somehow holds one can never take the app down. Silently wrapping on
 * write would hide the bug; failing closed on read would surface it as a blank
 * page.
 */
export function normalizeHue(input: unknown): number {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return DEFAULT_BRAND_HUE;
  return Math.round(((n % 360) + 360) % 360);
}

const HUE_NAMES: readonly { max: number; name: string }[] = [
  { max: 15, name: "red" },
  { max: 45, name: "orange" },
  { max: 75, name: "amber-yellow" },
  { max: 105, name: "yellow-green" },
  { max: 150, name: "green" },
  { max: 180, name: "emerald-teal" },
  { max: 210, name: "teal-cyan" },
  { max: 240, name: "sky blue" },
  { max: 270, name: "blue" },
  { max: 300, name: "indigo-violet" },
  { max: 330, name: "purple-magenta" },
  { max: 360, name: "pink-red" },
];

/**
 * The hue in words.
 *
 * Not decoration: a number from 0 to 359 conveys a colour only to someone who
 * already thinks in colour wheels, and a swatch conveys it only to someone who
 * can see it. This is the same rule StatusChip enforces — never colour alone
 * (WCAG 1.4.1) — applied to the control that picks the colour.
 */
export function hueName(hue: number): string {
  const h = normalizeHue(hue);
  return HUE_NAMES.find((bucket) => h < bucket.max)?.name ?? "teal-cyan";
}

export type BrandingInput = {
  clinic_name: string;
  tagline: string | null;
  logo_url: string | null;
  brand_hue: number;
};

export const brandingSchema: Schema<BrandingInput> = {
  clinic_name: required("Clinic name", CLINIC_NAME_MAX),
  tagline: optional(TAGLINE_MAX),
  logo_url: httpsUrl({ label: "Logo", max: LOGO_URL_MAX }),
  // Every integer in this range is already proven: scripts/check-contrast.mjs
  // sweeps all 360 hues x both themes x every declared token pair on every
  // `npm run check`. So there is no such thing as a hue that needs a warning.
  brand_hue: intInRange(BRAND_HUE_MIN, BRAND_HUE_MAX, "Brand colour"),
};
