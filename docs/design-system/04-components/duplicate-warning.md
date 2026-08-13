# DuplicateWarning

> Built in Phase 2.1d. [src/components/patients/DuplicateWarning.tsx](../../../src/components/patients/DuplicateWarning.tsx) ·
> [gallery](/design-system#duplicate-warning)

The duplicate-patient soft stop: valid input that a human should look at before it becomes a
second record for the same person.

## Anatomy

```
<InlineAlert tone="warning" title={confirm.title}>
  ├── <p>{confirm.detail}</p>
  ├── <ul>                       STAFF ONLY — one <li> per match
  │     └── link · patient number · reason · confidence
  └── <SubmitButton              STAFF ONLY
        name="ack" value={confirm.ack} />
```

Rendered **inside** the `<form>`, above the fields.

## Variants

There is **no `mode` prop**. The two modes are the two shapes of
[`Confirmable`](../../../src/lib/forms/action-state.ts):

| | `existingHref` | `proceedLabel` | `matches` | Renders |
|---|---|---|---|---|
| **Staff** | set | set | up to 5 | title, detail, the match list, a way to proceed |
| **Self** | absent | absent | absent | title and detail. Nothing else. |

That is the whole enumeration-safety mechanism, and it lives in the **type** rather than in
this component's markup — the same reasoning that makes [StatusChip](status-chip.md) derive
its label from a key instead of accepting one as a prop. A `mode` prop would move the
guarantee somewhere it can be passed wrongly. The single `proceedLabel` guard means that even
if a future caller wrongly put `matches` on a patient-facing confirm, no name, number, link or
proceed control would render.

## Props

| Prop | Type | Notes |
|---|---|---|
| `confirm` | `Confirmable` | the whole `confirm` payload from the action's `ActionState` |

## States

Only one — it exists solely for `state.status === "confirm"`. It is **not** an error state and
must never be styled as one: `tone="warning"`, never `danger`. A `confirm` is nobody's problem
yet, and `--destructive` next to a patient's name reads as something being wrong with the
patient.

## The ack, and why it is on the button

`confirm.ack` is a **hash of the exact normalised values the probe ran against**, not a
boolean. It rides as this button's own `name`/`value`, because a submit button's name/value
reaches `FormData` only when *that* button submitted.

A hidden input cannot do this job. It is submitted by **every** button in the form, so the
primary "Create patient" would carry the ack too and silently skip the check it exists to
re-run. On the button:

- **primary submit** — no ack in `FormData`, so the check *always* runs;
- **"Create a separate record"** — carries the ack minted for the values as rendered. Edit the
  email first and the server's freshly computed hash no longer matches, so the probe re-runs
  and warns about the *new* values. A dismissal for one person can never be attached to a
  submit for another.

## A11y

- `InlineAlert tone="warning"` carries `role="alert"`, so the warning is announced when it
  replaces the form's previous state.
- Both submit buttons are `SubmitButton`s in the same form, so `useFormStatus` disables both
  while pending — a double submit here is two patients.
- Match links are ordinary anchors: open-in-new-tab works, so staff can compare records
  side by side without losing what they typed.

## Do / Don't

**Do** put the whole match list in front of the person deciding. The `(email, dob)` index is
non-unique precisely so twins sharing a parent's mailbox *can* both exist; collapsing five
matches to one link throws away the information the decision needs.

**Do** fail closed in the action. If the probe errors, return `status: "error"` and write
nothing — writing a record because the safety check could not run is the one outcome that must
not happen quietly.

**Don't** add a `mode` prop, and don't set `proceedLabel` on a patient-facing confirm. Both
move enumeration-safety out of the type.

**Don't** render this on `/register`. See below.

## Where each mode is used

The **staff** mode is live on `/patients/new` and `/patients/[id]/edit`.

The **self** mode has **no live call site in Phase 2.1**, and that is the design working
rather than a gap. `claim_or_create_patient` takes no email — it reads a *verified* one from
`auth.users` for `auth.uid()` — so a patient has no selector to probe with, and
`find_patient_duplicates` raises `forbidden` for the `patient` role anyway. `/register`
therefore renders **no warning at all** and shows the identical success screen whether the RPC
claimed an existing walk-in or created a new row. That silence *is* the guarantee.

The self shape's first real caller is **Phase 4 guest booking**, which creates provisional
rows from a public form — exactly where a non-revealing confirm is needed. The gallery
specimen keeps the degenerate rendering proven, and covered by axe, until then.

## Example

```tsx
{state.status === "confirm" && <DuplicateWarning confirm={state.confirm} />}
```
