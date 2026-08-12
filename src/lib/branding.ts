import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Clinic branding — read from the public `clinic_branding` view.
 *
 * The view is the only door into `private.settings` (which is revoked from
 * anon/authenticated) and exposes just the four non-secret keys, so the public
 * landing page and the Phase 9 PWA manifest can read it without a session.
 *
 * Caching matters here: this value changes roughly never but is read in the
 * root layout on every request, and the database is in ap-southeast-1 while the
 * worker runs at the edge. Two layers:
 *   - `cache()` dedupes within a single render pass;
 *   - a module-level TTL memo survives across requests in a warm Worker isolate.
 * OpenNext has no incremental cache configured yet, so `unstable_cache` would
 * have nowhere to persist — revisit in Phase 2.2 when the branding screen needs
 * `revalidateTag`. Until then a stale hue for at most TTL seconds is harmless.
 */

export const DEFAULT_BRAND_HUE = 195;
export const DEFAULT_CLINIC_NAME = "DentClinic";

const TTL_MS = 5 * 60_000;

export type Branding = {
  clinicName: string;
  tagline: string | null;
  logoUrl: string | null;
  brandHue: number;
};

const FALLBACK: Branding = {
  clinicName: DEFAULT_CLINIC_NAME,
  tagline: null,
  logoUrl: null,
  brandHue: DEFAULT_BRAND_HUE,
};

let memo: { at: number; value: Branding } | null = null;

/**
 * Normalising into [0, 360) is a security control, not hygiene: the result is
 * interpolated into an inline `style` attribute on <html> and originates in a
 * database row that superadmins will be able to edit from Phase 2.2.
 */
export function normalizeHue(input: unknown): number {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return DEFAULT_BRAND_HUE;
  return Math.round(((n % 360) + 360) % 360);
}

export const getBranding = cache(async (): Promise<Branding> => {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clinic_branding")
      .select("clinic_name, tagline, logo_url, brand_hue")
      .single();

    if (error || !data) return FALLBACK;

    const value: Branding = {
      clinicName: data.clinic_name ?? DEFAULT_CLINIC_NAME,
      tagline: data.tagline ?? null,
      logoUrl: data.logo_url ?? null,
      brandHue: normalizeHue(data.brand_hue),
    };
    memo = { at: Date.now(), value };
    return value;
  } catch {
    // Branding must never be able to take the app down.
    return FALLBACK;
  }
});

export async function getBrandHue(): Promise<number> {
  return (await getBranding()).brandHue;
}
