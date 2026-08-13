# BrandingForm

> Built in Phase 2.2a. [src/components/admin/BrandingForm.tsx](../../../src/components/admin/BrandingForm.tsx) · [gallery](/design-system#branding-form)

The `/admin/branding` editor: clinic name, tagline, logo and the brand hue that colours the
entire app.

## Anatomy

```
<div>
  ├── <section aria-labelledby="logo-heading">     ← OUTSIDE the form, on purpose
  │     ├── <h2 id="logo-heading">Logo
  │     ├── preview <img> | "None"
  │     ├── <Field as="file">                      uploads immediately
  │     ├── <Button>Remove logo                    only when one is set
  │     └── <InlineAlert>                          uploading / uploaded / removed
  │
  └── <form action={formAction} noValidate>
        ├── <InlineAlert tone="danger">            formError
        ├── <InlineAlert tone="success">           after a save
        ├── <input type="hidden" name="logo_url">  ← the upload's result
        ├── <Field name="clinic_name" required>
        ├── <Field name="tagline" as="textarea">
        ├── <Field name="brand_hue" type="number" min={0} max={359}>
        └── <SubmitButton> + Back link
```

## The two-block split is the whole design

**A file input inside a `<form action={serverAction}>` is serialized into the action payload.**
Next's `serverActions.bodySizeLimit` defaults to 1 MB, so a logo posted through the form would
either fail or force that limit up for every action in the app. Putting the picker in a
sibling `<section>` means the bytes never enter the form: the browser mints a signed upload URL
via a server action, PUTs the file **straight to Supabase Storage**, and only the resulting URL
travels into the form, as a hidden text input.

The same split solves a second, unrelated problem for free: a file input
[cannot echo](field.md) after a rejected submit, because browsers forbid setting its value.
Here it never has to — by submit time the file is already uploaded and only its URL is in play,
so a validation error on the clinic name never costs the upload.

## Removing a logo is an update, not a delete

**"Remove logo" empties the hidden input; the save writes `logo_url = null`.** No file is
deleted — migration 0011 grants no DELETE on `storage.objects` at all, because uploads are
content-addressed and nothing is ever overwritten. A superseded object simply stops being
referenced.

The control's absence was a real gap, caught by the live acceptance run rather than by review:
the hidden input is React-controlled, so once a logo was uploaded there was **no way to take it
down** — the branding doc claimed removal was "an UPDATE of the setting to null" while nothing
in the UI could perform that update.

## No live colour preview, deliberately

**The page you are standing on is the preview.** `updateBranding` calls
`revalidatePath("/", "layout")`, so the sidebar brand text and this form's own primary-coloured
Save button re-colour in place the moment you save. A preview widget would be a second, weaker
source of truth for the same thing.

If one is ever added, the trap to avoid is the Phase 1.2 `.dark` bug in a new costume: **you
cannot preview by overriding `--brand-hue` on a wrapper `<div>`.** `--primary` is declared on
`:root, .dark`, and custom properties resolve where they are *declared*, so a descendant
re-declaring the hue changes nothing. A preview must re-derive the colour at the swatch itself.

## Why a number input for the hue

`<input type="color">` returns hex, and hex → OKLCH-hue is lossy and undefined for greys.
`<input type="range">` is a linear control for a circular quantity, announces the same number
anyway, and is a precision problem at 44px. A number input plus `hueName()` — which says
"teal-cyan" in words — carries the value to someone reading, someone listening, and someone who
cannot distinguish the colours.

**Every value in 0–359 is safe, so the form warns about none of them.**
[check-contrast.mjs](../../../scripts/check-contrast.mjs) sweeps all 360 hues × both themes ×
every declared pair on each `npm run check`, with a pessimistic luminance model. A "safe hues"
list here would be an unproven second opinion about something already proven.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `action` | `(prev, formData) => Promise<ActionState<BrandingField>>` | — | required |
| `initial` | `Partial<Record<BrandingField, string>>` | — | current values, from `getBrandingFresh()` |
| `mintUploadUrl` | `(contentType, size) => Promise<LogoUploadTicket>` | — | **optional**; omitted in the gallery, where importing `@/app/actions/*` is banned. Without it the picker renders disabled |
| `initialState` | `ActionState<BrandingField>` | `IDLE` | seeds a non-idle state so the gallery can prove the error and success shapes |

`initialState` is not a convenience — it is what puts the invalid and success renderings through
the matrix (2 themes × 4 font steps) under axe. [PatientForm](../../modules/03-patients.md) has
no equivalent, so its error states remain unproven; copy this when that is fixed.

## States

**idle · uploading · uploaded · removed · upload error · invalid · error · success.** The upload
states are local (`useTransition`) and independent of the form's `ActionState`: an upload can
fail while the form is perfectly valid, and vice versa.

"Uploaded" and "Removed" both say **"Save to apply it"**, because neither has touched
`private.settings` yet — the storage write and the settings write are separate steps, and
saying otherwise would be a lie the user finds out about on the next page load.

Save is disabled while an upload is in flight, so a save cannot race ahead of the URL it is
meant to carry.

## A11y

- The logo `<img>` is `alt=""` — decorative. The clinic name is the adjacent labelled field, so
  announcing the image too would just repeat it.
- The upload section is `aria-labelledby` its own `<h2>`, which is what makes it a landmark
  region distinct from the form rather than loose controls above it.
- Upload progress and result are `InlineAlert`s, whose ARIA role is derived from tone
  (`info` → none, `success` → `status`) — never a toast, because the result *is* visible here.
- A plain `<img>` rather than `next/image`: there is no `images` config, `remotePatterns` would
  have to allow-list the Supabase host and then 400 on any externally-hosted logo, and OpenNext
  on Cloudflare has no built-in optimizer. `width`/`height` are set to reserve the box.

## Do / Don't

**Do** seed the form from `getBrandingFresh()`, never `getBranding()`. The cached read is shared
by every visitor and can be up to an hour old; a form seeded from it writes stale values back
over a colleague's save.

**Don't** call `getBranding()` inside `updateBranding`. `updateTag` drops the shared entry but
cannot clear React's per-request `cache()`, so a read before the write poisons the render that
follows in the same request.

**Don't** replace the success `InlineAlert` with a toast. [forms.md](../05-patterns/forms.md)
requires all three of succeeded / not visible / no decision needed — and a re-branded page is
about as visible as a result gets.

**Don't** move the file input inside the `<form>`. Both reasons above stop being true at once.

## Example

```tsx
const branding = await getBrandingFresh();

<BrandingForm
  action={updateBranding}
  mintUploadUrl={createLogoUploadUrl}
  initial={{
    clinic_name: branding.clinicName,
    tagline: branding.tagline ?? "",
    logo_url: branding.logoUrl ?? "",
    brand_hue: String(branding.brandHue),
  }}
/>
```
