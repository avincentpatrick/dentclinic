# SubmitButton

> Built in Phase 2.1. [src/components/shared/SubmitButton.tsx](../../../src/components/shared/SubmitButton.tsx) · [gallery](/design-system#submit-button)

The submit control for a server-action form, and the only client component a Phase 2 form
needs.

## Anatomy

```
<Button type="submit" aria-busy={pending} disabled={pending || disabled}>
  ├── <LoaderCircle />   only while pending, aria-hidden, animate-spin
  └── label              idleLabel ⇄ pendingLabel
```

## Variants

Inherits [Button](button.md)'s `variant`. `default` for the primary action of a form,
`outline` for a secondary submit (e.g. "Save as draft"). No size variant — the 44px floor is
not optional here.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `idleLabel` | `string` | — | required; a verb — "Create patient", not "Submit" |
| `pendingLabel` | `string` | — | required; "Saving…", "Sending…" |
| `variant` | Button variant | `default` | |
| `disabled` | `boolean` | `false` | for genuinely unavailable actions (no API key configured), **not** for validation |
| `className` | `string` | — | |

## States

**idle · pending · disabled.** Pending comes from `useFormStatus()`, which reads the nearest
enclosing `<form>`.

⚠️ **It must be rendered *inside* the form, not by the component that renders the form.**
That is the usual mistake with `useFormStatus`, and it fails *silently* — the button simply
never goes pending, which looks like a slow server rather than a bug.

## A11y

- `aria-busy` while pending, so the state is exposed and not merely animated.
- The spinner is `aria-hidden`; the label swap carries the meaning. Under
  `prefers-reduced-motion` the animation stops (`motion-reduce:animate-none`) and the label
  and `aria-busy` still communicate the state — which is why the label swap is required
  rather than decorative.
- `min-h-11`, always.

## Do / Don't

**Do** name the outcome in `idleLabel`. "Create patient" tells someone what is about to
happen; "Submit" does not.

**Do** rely on the disable-while-pending behaviour. 00-principles.md forbids optimistic UI for
booking and clinical writes, which makes double-submit a real hazard — two POSTs of a patient
create are two patients.

**Don't** disable it for invalid input. Server-side validation is the source of truth, and a
button that is disabled with no explanation is worse than one that submits and returns a
field error. Reserve `disabled` for actions that genuinely cannot run.

**Don't** add a second progress indicator. `aria-busy` plus the label swap is the whole story.

**Don't** assume there is a no-JS fallback behind this. `useActionState` forms do not submit
without JavaScript at all — React emits `$ACTION_REF_n` rather than a self-contained
`$ACTION_ID_*`, and the server cannot resolve it. Measured on a production build; see
[05-patterns/forms.md](../05-patterns/forms.md). Plain void-returning actions (sign-out,
`savePreferences`) are unaffected.

## Example

```tsx
<form action={formAction} noValidate>
  <Field name="firstName" label="First name" required />
  <SubmitButton idleLabel="Create patient" pendingLabel="Saving…" />
</form>
```
