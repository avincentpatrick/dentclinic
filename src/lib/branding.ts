import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import {
  DEFAULT_BRAND_HUE,
  DEFAULT_CLINIC_NAME,
  DEFAULT_CURRENCY,
  normalizeHue,
  type Branding,
} from "@/lib/settings/branding-schema";

/**
 * Clinic branding — read from the public `clinic_branding` view.
 *
 * The view is the only door into `private.settings` (which is revoked from
 * anon/authenticated) and exposes just the four non-secret keys, so the public
 * landing page and the Phase 9 PWA manifest can read it without a session.
 *
 * Caching matters here: the value changes roughly never but is read in the root
 * layout on EVERY request, and the database is in ap-southeast-1 while the
 * worker runs at the edge. Three layers, each earning its place:
 *
 *   - `cache()` dedupes within a single render pass (the root layout and
 *     AppShell both call it);
 *   - `unstable_cache` persists across requests AND isolates, in Workers KV;
 *   - `updateTag(BRANDING_TAG)` from the settings action drops it, strongly
 *     consistently, via the D1 tag cache. `updateTag` rather than
 *     `revalidateTag`: the latter's recommended `"max"` profile is
 *     stale-while-revalidate, which would serve the OLD branding to the first
 *     visitor after a save.
 *
 * THE MODULE-LEVEL TTL MEMO THIS REPLACED IS GONE, AND MUST NOT COME BACK.
 * A module variable lives in one isolate; `revalidatePath` knows nothing about
 * it; and Cloudflare runs many isolates. So a save in isolate A could not reach
 * isolate B, and the worst case was five minutes of stale hue with no way to
 * shorten it. Putting a short memo in front of this cache would shadow it and
 * reintroduce exactly that, in miniature.
 *
 * WHY NOT `use cache`. `unstable_cache` is marked in Next 16's docs as replaced
 * by the `use cache` directive — but that requires `cacheComponents: true`,
 * which enables PPR by default, switches navigation to React `<Activity>`, and
 * changes prefetching. PROGRESS decision 8 rests on the current prefetch model:
 * without Cache Components a dynamic route is not prefetched at all unless it
 * has a `loading.tsx`, which is why `/patients` deliberately has none and why
 * the read audit there is currently sound. Enabling the flag would invert that
 * premise and rest the audit's correctness on "a prefetch presumably does not
 * render the dynamic hole". Next ships a maintained guide for this exact
 * pre-Cache-Components model, so it is a supported path rather than a holdout.
 * Migration, when the flag is eventually adopted, is one function — and the
 * tag invalidation call is byte-identical either way.
 */

export const BRANDING_TAG = "clinic-branding";

/**
 * A ceiling, not the mechanism. Tag revalidation is what makes a save visible;
 * this only bounds how long a LOST revalidation could persist.
 */
const BRANDING_REVALIDATE_S = 3600;

export { DEFAULT_BRAND_HUE, DEFAULT_CLINIC_NAME, DEFAULT_CURRENCY, normalizeHue };
export type { Branding };

const FALLBACK: Branding = {
  clinicName: DEFAULT_CLINIC_NAME,
  tagline: null,
  logoUrl: null,
  brandHue: DEFAULT_BRAND_HUE,
  currency: DEFAULT_CURRENCY,
};

/** One read of the view. Returns null on ANY failure — see `cachedBranding`. */
async function fetchBranding(): Promise<Branding | null> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("clinic_branding")
      .select("clinic_name, tagline, logo_url, brand_hue, currency")
      .single();

    if (error || !data) return null;

    return {
      clinicName: data.clinic_name ?? DEFAULT_CLINIC_NAME,
      tagline: data.tagline ?? null,
      logoUrl: data.logo_url ?? null,
      brandHue: normalizeHue(data.brand_hue),
      currency: data.currency ?? DEFAULT_CURRENCY,
    };
  } catch {
    return null;
  }
}

/**
 * THROWS on failure, deliberately, and this is load-bearing.
 *
 * `unstable_cache` stores whatever the function RETURNS. Returning FALLBACK on
 * a transient database blip would pin "DentClinic" and hue 195 into KV for the
 * whole revalidate window — the precise bug the old module memo avoided by not
 * memoizing its error path. A rejected promise is not stored, so the next
 * request simply retries. Do not "simplify" this into a return.
 */
const cachedBranding = unstable_cache(
  async (): Promise<Branding> => {
    const value = await fetchBranding();
    if (!value) throw new Error("branding-unavailable");
    return value;
  },
  ["clinic-branding"],
  { tags: [BRANDING_TAG], revalidate: BRANDING_REVALIDATE_S },
);

export const getBranding = cache(async (): Promise<Branding> => {
  try {
    return await cachedBranding();
  } catch {
    // Branding must never be able to take the app down.
    return FALLBACK;
  }
});

/**
 * Bypasses both cache layers.
 *
 * For the /admin/branding editor ONLY: a form seeded from a cached read can
 * write stale values straight back over fresh ones, which is how a second
 * admin's change silently disappears.
 */
export async function getBrandingFresh(): Promise<Branding> {
  return (await fetchBranding()) ?? FALLBACK;
}
