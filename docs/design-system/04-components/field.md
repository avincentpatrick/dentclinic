# Field

> Built in Phase 2.1. [src/components/shared/Field.tsx](../../../src/components/shared/Field.tsx) · [gallery](/design-system#field)

One form field — label, control, hint, error — wired together correctly once, so no call
site has to remember `aria-describedby`.

## Anatomy

```
<div>
  ├── <label htmlFor={name}>   label + optional "(required)"
  ├── control                  Input | Textarea | native <select> | native checkbox
  ├── <p id={name}-hint>       optional, muted
  └── <p id={name}-error>      role="alert", --destructive-on-soft
```

`id` is always the field `name`. That is what makes label association, `aria-describedby`
and server-returned `fieldErrors` line up without any per-call-site wiring.

## Variants

| `as` | Control | Notes |
|---|---|---|
| `"input"` *(default)* | `<Input>` | `type` = text · email · tel · date · number · url |
| `"textarea"` | `<Textarea>` | `rows` default 3 |
| `"select"` | **native `<select>`** | `options: {value,label}[]`, optional `placeholder` as a disabled empty option |
| `"checkbox"` | **native `<input type=checkbox>`** | label sits right of the box; the whole row is the target |

Native `<select>` and `<input type="checkbox">` are deliberate, not a shortcut. They get the
platform picker on mobile, they need no roving-focus implementation, and they keep the field
usable in the widest range of assistive tech. Same reasoning
[AppearancePanel](appearance-panel.md) gives for using native radios rather than a Radix
RadioGroup.

(Progressive enhancement is *not* among the reasons here: `useActionState` forms require
JavaScript regardless of which controls they contain — see
[05-patterns/forms.md](../05-patterns/forms.md). It remains a reason in `AppearancePanel`,
whose action is a plain void-returning one.)

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `name` | `string` | — | required; also the `id` and the `fieldErrors` key |
| `label` | `string` | — | required |
| `as` | `"input" \| "textarea" \| "select" \| "checkbox"` | `"input"` | discriminates the rest of the props |
| `hint` | `string` | — | rendered before the error, both referenced by `aria-describedby` |
| `error` | `string` | — | from `errorsOf(state)[name]` |
| `required` | `boolean` | `false` | renders "(required)" and `aria-required`; **advisory only** — see below |
| `disabled` | `boolean` | `false` | |
| `options` | `{value,label}[]` | — | `as="select"` only, required there |
| `defaultValue` / `defaultChecked` | `string` / `boolean` | — | from `valueOf(state, name)` |

## States

**default · focus · invalid · disabled.** Invalid is driven by the presence of `error`: the
control gets `aria-invalid` and the destructive ring, and the message gets `role="alert"`.
Those are two separate mechanisms and shipping one without the other is the usual bug — the
control must *say* it is invalid, and the message must be *announced*.

There is no loading state. The whole form goes pending via [SubmitButton](submit-button.md).

## A11y

- **`min-h-11` (2.75rem) and `text-base` (1rem) are enforced here**, overriding the shipped
  primitive. `components/ui/input.tsx` is shadcn's `h-8` + `md:text-sm`; both violate rules
  this project holds: 44px targets (WCAG 2.5.8 asks 24px, this codebase holds 44), and never
  below 1rem on a form control or **iOS zooms the viewport on focus**. `md:text-base` is what
  cancels the primitive's `md:text-sm`.
- Every field has a real `<label htmlFor>`. Never a placeholder as a label — it disappears on
  focus, exactly when it is needed.
- The checkbox variant makes the **whole row** the label, so the target is the text and not a
  16px box.
- `required` sets `aria-required` and a visible "(required)" but **not** the HTML `required`
  attribute: forms carry `noValidate` so the server is the single source of truth. One set of
  messages, and two validators never disagree about what is acceptable.

## Do / Don't

**Do** pass `error={errors.fieldName}` straight from `errorsOf(state)` — the names match by
construction.

**Do** set `autoComplete` (`given-name`, `family-name`, `email`, `tel`, `bday`). It is the
difference between a patient typing their details and tapping once.

**Don't** add the HTML `required` attribute by hand. It re-introduces browser validation
alongside ours, with different copy and different timing.

**Don't** use `<Input>` directly in a form. It has no label, no error wiring, and the wrong
height — the three things this component exists to fix.

**Don't** put the error message anywhere but here. A form-level banner listing field errors
is the pattern where users cannot tell which input to fix; that is what
[InlineAlert](inline-alert.md) is *not* for.

## Example

```tsx
<Field
  name="dob"
  label="Date of birth"
  type="date"
  required
  defaultValue={valueOf(state, "dob")}
  error={errors.dob}
  autoComplete="bday"
  hint="Used to tell patients with the same name apart."
/>
```
