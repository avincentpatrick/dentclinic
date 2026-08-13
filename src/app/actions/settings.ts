"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getSuperadminActor } from "@/lib/auth/actor";
import { BRANDING_TAG } from "@/lib/branding";
import { echo, parseForm } from "@/lib/forms/validation";
import {
  BRANDING_FIELDS,
  brandingSchema,
  LOGO_BUCKET,
  LOGO_MAX_BYTES,
  LOGO_MIME,
  type BrandingField,
} from "@/lib/settings/branding-schema";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Clinic-wide settings writes.
 *
 * EVERY export re-checks the role in-action. Middleware gates NAVIGATION; a
 * Server Action is a POST of an action id to whatever path the browser is
 * already on, so a staff user sitting on /today can invoke any action id it can
 * learn, and middleware never sees an /admin request at all (AGENTS.md).
 *
 * `public.update_clinic_branding` re-checks `jwt_role()` and raises `forbidden`
 * before touching a row, so that is the real boundary. These checks exist to
 * turn the raise into a sentence a person can read.
 */

const PERMISSION_DENIED = "You don't have permission to change clinic settings.";

export async function updateBranding(
  _prev: ActionState<BrandingField>,
  formData: FormData,
): Promise<ActionState<BrandingField>> {
  // Echo FIRST, so every failure path below returns the user's typing intact.
  const values = echo(formData, BRANDING_FIELDS);

  const actor = await getSuperadminActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, brandingSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { error } = await actor.supabase.rpc("update_clinic_branding", {
    p_clinic_name: v.clinic_name,
    p_brand_hue: v.brand_hue,
    // `?? undefined` omits the argument so the SQL default (null) applies — the
    // house pattern from claim_or_create_patient. The RPC treats a null tagline
    // as "cleared" rather than "unchanged", which is correct because the form
    // always submits all four fields.
    p_tagline: v.tagline ?? undefined,
    p_logo_url: v.logo_url ?? undefined,
  });
  if (error) {
    return { status: "error", formError: "Couldn't save the branding. Try again.", values };
  }

  // THE mechanism: drops the shared cache entry for every isolate, via the
  // strongly-consistent D1 tag cache. Without this the save stays invisible
  // until the revalidate ceiling expires.
  //
  // `updateTag`, NOT `revalidateTag`, and the difference decides whether this
  // increment meets its acceptance criterion. In Next 16 `revalidateTag` takes
  // a second argument, and the recommended `"max"` profile is
  // stale-while-revalidate: the next visitor is served the OLD branding while
  // the new value is fetched behind them. `updateTag` expires the entry
  // immediately, so the next request waits and gets fresh data — the
  // read-your-own-writes case, which is exactly what saving your clinic's name
  // and colour is. It is restricted to Server Actions, which is where we are.
  updateTag(BRANDING_TAG);
  // Cosmetic but wanted: marks THIS admin's client-side Router Cache stale so
  // the shell re-colours in place rather than on a hard reload. "layout"
  // because the hue is applied on <html> in the ROOT layout.
  revalidatePath("/", "layout");

  // `values` is REQUIRED on a success that stays put: React resets the form to
  // its defaultValue attributes when the action completes, so a bare success
  // blanks the very fields the save just wrote (action-state.ts, and the
  // measured /register step-1 bug). Normalised rather than echoed, so the user
  // sees what is actually stored.
  return {
    status: "success",
    message: "Branding saved.",
    values: {
      clinic_name: v.clinic_name,
      tagline: v.tagline ?? "",
      logo_url: v.logo_url ?? "",
      brand_hue: String(v.brand_hue),
    },
  };
}

export type LogoUploadTicket =
  | { ok: true; path: string; token: string; publicUrl: string }
  | { ok: false; error: string };

/**
 * Mints a signed upload URL so the BROWSER uploads straight to Supabase and the
 * bytes never touch the Worker.
 *
 * Not a form action and not an ActionState: it is a one-shot call from a change
 * handler. `"use server"` permits any async export.
 *
 * It exists because Next's `serverActions.bodySizeLimit` defaults to 1 MB —
 * posting a logo through the settings form would either fail outright or force
 * us to raise a limit that is protecting the Worker. The bytes go around it
 * instead of through it.
 *
 * The extension is derived from the CONTENT TYPE, never from the file name: a
 * filename is attacker-controlled and is not evidence of anything.
 *
 * The path is content-addressed with a fresh uuid, so nothing is ever
 * overwritten. That is what lets migration 0011 withhold both UPDATE and DELETE
 * policies, and it means a CDN can never serve a stale logo.
 */
export async function createLogoUploadUrl(
  contentType: string,
  size: number,
): Promise<LogoUploadTicket> {
  const actor = await getSuperadminActor();
  if (!actor) return { ok: false, error: PERMISSION_DENIED };

  if (!(LOGO_MIME as readonly string[]).includes(contentType)) {
    return { ok: false, error: "Use a PNG, JPEG or WebP image." };
  }
  if (!Number.isFinite(size) || size <= 0 || size > LOGO_MAX_BYTES) {
    return { ok: false, error: "That image is over 1 MB. Use a smaller one." };
  }

  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `logo/${crypto.randomUUID()}.${ext}`;

  // createSignedUploadUrl needs INSERT on storage.objects for the CALLER, so
  // migration 0011's superadmin policy gates the mint itself. The check above
  // only turns a denial into a sentence.
  const { data, error } = await actor.supabase.storage
    .from(LOGO_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Couldn't start the upload. Try again." };

  const { data: pub } = actor.supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return { ok: true, path: data.path, token: data.token, publicUrl: pub.publicUrl };
}
