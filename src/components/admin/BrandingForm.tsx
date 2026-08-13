"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Field } from "@/components/shared/Field";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { SubmitButton } from "@/components/shared/SubmitButton";
import { Button } from "@/components/ui/button";
import { uploadLogo } from "@/components/admin/upload-logo";
import {
  IDLE,
  errorsOf,
  formErrorOf,
  hasValues,
  valueOf,
  type ActionState,
} from "@/lib/forms/action-state";
import {
  BRAND_HUE_MAX,
  BRAND_HUE_MIN,
  hueName,
  LOGO_ACCEPT,
  LOGO_MAX_BYTES,
  normalizeHue,
  type BrandingField,
} from "@/lib/settings/branding-schema";

type BrandingAction = (
  prev: ActionState<BrandingField>,
  formData: FormData,
) => Promise<ActionState<BrandingField>>;

export type BrandingFormValues = Partial<Record<BrandingField, string>>;

/**
 * The mint half of the upload handshake — a Server Action, which is the only
 * kind of function a Server Component may hand to a client child.
 *
 * Optional so the gallery can render this form without it: a specimen may not
 * import `@/app/actions/*`, and with no minter the picker renders disabled,
 * which is the honest representation of "this control needs a server".
 */
export type LogoUploader = (
  contentType: string,
  size: number,
) => Promise<
  { ok: true; path: string; token: string; publicUrl: string } | { ok: false; error: string }
>;

/**
 * The branding editor.
 *
 * TWO SIBLING BLOCKS, and the separation is load-bearing: the logo picker sits
 * OUTSIDE the <form>. A file input inside a form whose action is a Server
 * Action gets serialized into the action payload, which hits Next's 1 MB
 * `serverActions.bodySizeLimit` — the signed-upload design only avoids the Worker
 * if the bytes never enter the form in the first place. The upload completes on
 * its own and its result rides into the form as a hidden text input.
 *
 * That has a second benefit worth stating, because it is the reason `Field`'s
 * file variant can exist at all: browsers forbid setting a file input's value,
 * so it is the one control that cannot echo after a rejected submit. Here it
 * never has to — by the time the form is submitted the file is already uploaded
 * and only its URL is in play.
 *
 * NO LIVE COLOUR PREVIEW, deliberately. The page you are standing on is the
 * preview: the action calls revalidatePath("/", "layout"), so the sidebar and
 * this form's own Save button re-colour in place the moment you save. A preview
 * widget would be a second, weaker source of truth for the same thing.
 *
 * If one is ever wanted, the trap to avoid is the Phase 1.2 `.dark` bug in a new
 * costume: you CANNOT preview by overriding --brand-hue on a wrapper, because
 * --primary is declared on `:root, .dark` and custom properties resolve where
 * they are declared. A preview must re-derive the colour at the swatch itself.
 */
export function BrandingForm({
  action,
  initial,
  mintUploadUrl,
  initialState,
}: {
  action: BrandingAction;
  initial: BrandingFormValues;
  /** Omitted in the gallery, where importing `@/app/actions/*` is banned. */
  mintUploadUrl?: LogoUploader;
  /** Seeds a non-idle state so the gallery can prove the error/success shapes. */
  initialState?: ActionState<BrandingField>;
}) {
  const [state, formAction] = useActionState(action, initialState ?? (IDLE as ActionState<BrandingField>));

  const errors = errorsOf(state);
  const formError = formErrorOf(state);
  const echoed = hasValues(state);
  const v = (field: BrandingField) => (echoed ? valueOf(state, field) : (initial[field] ?? ""));

  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();

  const savedHue = normalizeHue(Number(v("brand_hue")) || 0);

  function onPickLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !mintUploadUrl) return;

    setUploadError(null);
    setUploadNote(null);

    // Checked here for a fast, specific message; checked again in the action
    // and again by the bucket's own limits. The client check is a courtesy, not
    // a control.
    if (file.size > LOGO_MAX_BYTES) {
      setUploadError("That image is over 1 MB. Use a smaller one.");
      return;
    }

    startUpload(async () => {
      const ticket = await mintUploadUrl(file.type, file.size);
      if (!ticket.ok) {
        setUploadError(ticket.error);
        return;
      }
      const uploaded = await uploadLogo(ticket.path, ticket.token, file);
      if (!uploaded) {
        setUploadError("The upload didn't finish. Try again.");
        return;
      }
      setLogoUrl(ticket.publicUrl);
      setUploadNote("Uploaded. Save to apply it.");
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section aria-labelledby="logo-heading" className="flex flex-col gap-3">
        <h2 id="logo-heading" className="text-base font-medium text-foreground">
          Logo
        </h2>

        <div className="flex items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-card ring-1 ring-border">
            {logoUrl ? (
              // A plain <img>, not next/image: there is no `images` config, and
              // OpenNext on Cloudflare has no built-in optimizer (it wants paid
              // Cloudflare Images) against a $0 hosting target. Sized to avoid
              // layout shift; alt="" because the clinic name is right beside it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                width={64}
                height={64}
                referrerPolicy="no-referrer"
                className="max-h-14 w-auto max-w-14 object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <Field
              as="file"
              name="logo_file"
              label={logoUrl ? "Replace logo" : "Upload logo"}
              accept={LOGO_ACCEPT}
              onChange={onPickLogo}
              disabled={uploading || !mintUploadUrl}
              hint="PNG, JPEG or WebP, up to 1 MB. Uploads straight to storage; press Save to apply it."
              error={uploadError ?? undefined}
            />
          </div>
        </div>

        {/* Removal is an UPDATE of the setting to null, never a file delete —
            migration 0011 grants no DELETE on storage.objects at all, because
            uploads are content-addressed and nothing is ever overwritten. Its
            absence was a real gap: without this control an uploaded logo could
            never be taken down, since the hidden input carrying the URL is
            React-controlled and has no other way to be emptied. */}
        {logoUrl && (
          <div>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={uploading}
              onClick={() => {
                setLogoUrl("");
                setUploadError(null);
                setUploadNote("Logo removed. Save to apply it.");
              }}
            >
              Remove logo
            </Button>
          </div>
        )}

        {uploading && <InlineAlert tone="info" title="Uploading…" />}
        {uploadNote && !uploading && <InlineAlert tone="success" title={uploadNote} />}
      </section>

      <form action={formAction} noValidate className="flex flex-col gap-6">
        {formError && <InlineAlert tone="danger" title={formError} />}
        {state.status === "success" && <InlineAlert tone="success" title={state.message} />}

        {/* The upload's result, carried as text. This is what makes the picker
            outside the form still reach the action. */}
        <input type="hidden" name="logo_url" value={logoUrl} />

        <Field
          name="clinic_name"
          label="Clinic name"
          required
          defaultValue={v("clinic_name")}
          error={errors.clinic_name}
          hint="Shown in the sidebar, on the sign-in page and in the browser tab."
        />

        <Field
          as="textarea"
          name="tagline"
          label="Tagline"
          rows={2}
          defaultValue={v("tagline")}
          error={errors.tagline}
          hint="One line under the clinic name on the public page. Leave blank for none."
        />

        <Field
          name="brand_hue"
          label="Brand colour"
          type="number"
          inputMode="numeric"
          required
          min={BRAND_HUE_MIN}
          max={BRAND_HUE_MAX}
          defaultValue={v("brand_hue")}
          error={errors.brand_hue}
          hint={`A position on the colour wheel from ${BRAND_HUE_MIN} to ${BRAND_HUE_MAX}. Currently ${savedHue} — ${hueName(savedHue)}. Every value is checked for contrast in both light and dark themes, so any number here is safe to use.`}
        />

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton idleLabel="Save branding" pendingLabel="Saving…" disabled={uploading} />
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/admin">Back to settings</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
