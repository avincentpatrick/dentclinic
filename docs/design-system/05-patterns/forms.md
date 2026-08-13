# Forms

> LIVE since Phase 2.1. Components: [Field](../04-components/field.md) ·
> [SubmitButton](../04-components/submit-button.md) · [InlineAlert](../04-components/inline-alert.md)

Phase 1 had no forms except the appearance panel, whose server action returns `void` because
it has nothing to say. Real forms need a channel back. This is that contract.

## The shape

```tsx
// action
export async function createPatient(
  _prev: ActionState<PatientField>,
  formData: FormData,
): Promise<ActionState<PatientField>> {
  const values = echo(formData, FIELDS);           // so a failed submit never empties the form
  const parsed = parseForm(formData, schema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  …
}

// form
const [state, formAction] = useActionState(createPatient, IDLE);
<form action={formAction} noValidate>
  <Field name="dob" label="Date of birth" error={errorsOf(state).dob}
         defaultValue={valueOf(state, "dob")} />
  <SubmitButton idleLabel="Create patient" pendingLabel="Saving…" />
</form>
```

`action={formAction}` on a plain `<form>` keeps the native POST, so the whole thing works
with JavaScript disabled. `SubmitButton` is the only client-side enhancement.

## The five states, and why they are five

[`ActionState`](../../../src/lib/forms/action-state.ts) is a discriminated union:

| Status | Whose problem | Renders as |
|---|---|---|
| `idle` | — | nothing |
| `invalid` | the user's, and fixable at a field | `Field`'s error, `role="alert"` |
| `confirm` | nobody's — needs a human decision | `InlineAlert tone="warning"` above the fields |
| `error` | ours | `InlineAlert` at form level |
| `success` | — | redirect, or a toast |

**`invalid` and `error` are deliberately different.** Collapsing them produces the familiar
"your input was invalid" banner over a form with no field marked. One renders at the field
where the fix is; the other apologises at form level.

## Validation

Hand-rolled in [`src/lib/forms/validation.ts`](../../../src/lib/forms/validation.ts) — not
zod. The reason is consistency, not bytes: `parseTheme`/`parseFontPref` in `lib/appearance.ts`
already establish the idiom (allow-list in, typed union out, never a throw), and a second
validation philosophy in one repo is worse than either alone. zod would save the predicate,
not the `fieldErrors` plumbing.

**Revisit at Phase 6.1**, where `medical_history_versions.data` is nested versioned jsonb —
that is where a schema library earns its keep. Keep `parseForm`'s return shape if so.

Two rules make it safe: `oneOf` is the only way a union-typed value enters the system, and no
validator throws.

**Client and server bounds must agree.** `isoDate({ notFuture: true })` allows *tomorrow*,
not today, because the DB's `patients_dob_sane` allows `current_date + 1` — the clinic is
UTC+8 and the server is UTC. If the two disagree, the database rejects what the form accepted
and the user sees an unexplainable error.

## Confirmable warnings

A `confirm` state is valid input that a human should look at first. Its `ack` is a **hash of
the exact values the check ran against**, not a boolean flag, and it is echoed back as a
server-rendered hidden input.

That difference is the design: editing a field after seeing a warning changes the hash, so
the ack no longer matches and the check re-runs. A boolean would let someone dismiss a warning
about one patient and submit a record for another with the dismissal still attached. Being
server-rendered is what makes "proceed anyway" work with JavaScript off — and a safety
mechanism that only works with JS is not a safety mechanism.

## Inline or toast

**Inline** when the message requires a decision or a correction, is tied to a field or region,
must persist while the user works, or is the direct result of the thing on screen.

**Toast** only when *all three* hold: the action succeeded, its result is not visible on the
current view, and no decision is required.

Never toast an error that needs a decision, and never let a toast be the *only* feedback —
it is invisible with JavaScript off. "Patient archived" is fine because the row visibly leaves
the roster. And per WCAG 2.2.1 an Undo toast is a time limit, so **Undo must also be reachable
from the archived row** — the toast is a convenience, not the only path.

## Rules

- `noValidate` on every form. The server is the single source of truth, so messages are
  identical with and without JS and two validators never disagree. `required` on `Field` is
  advisory (`aria-required` + a visible marker).
- Field `name` is the `id` is the `fieldErrors` key. They line up by construction.
- Always `echo` values back. A form that empties itself on error is how people give up.
- Always set `autoComplete`.
- Redirect on success for creates (`redirect('/patients/[id]?created=1')`); stay put for edits.
- **Privileged actions re-check the role inside the action.** Middleware gates navigation, not
  action ids — see AGENTS.md.
- No draft autosave in Phase 2. Forms are ≤10 fields on one screen, `useActionState` preserves
  values across the round trip, and `/register` posts per step. The first
  [`useDraftSaver`](../../../src/lib/idle/drafts.ts) registrant is Phase 6.1's
  MedicalHistoryForm.
