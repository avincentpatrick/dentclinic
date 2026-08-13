# InlineAlert

> Built in Phase 2.1. [src/components/shared/InlineAlert.tsx](../../../src/components/shared/InlineAlert.tsx) · [gallery](/design-system#inline-alert)

A message bound to the thing on screen. The counterpart to a toast, and the default of the two.

## Anatomy

```
<div role=alert|status|—>      tone-coloured soft surface + inset ring
  ├── <Icon />                 aria-hidden, DERIVED from tone
  └── <div>
        ├── title              <p class="font-medium">
        └── children           detail, links, buttons
```

## Variants

| Tone | Meaning | Icon | Announced as | Typical use |
|---|---|---|---|---|
| `info` | Ambient context, no action needed | Info | *(nothing)* | "Emails send as …@brevosend.com because…" |
| `warning` | Needs a decision | TriangleAlert | `role="alert"` | Duplicate patient; DNS record missing |
| `success` | Completed, and you can see the result here | CircleCheck | `role="status"` | "Test email accepted by Brevo" |
| `danger` | Failed, or will destroy data | CircleAlert | `role="alert"` | Archive confirmation |

The icon is **derived from the tone**, not a prop — same contract as
[StatusChip](status-chip.md). An alert whose icon disagrees with its colour is unrepresentable.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `tone` | `"info" \| "warning" \| "success" \| "danger"` | — | required; forces the author to choose a meaning |
| `title` | `string` | — | required; the one-line summary |
| `children` | `ReactNode` | — | detail and any actions, so they inherit the tone |
| `className` | `string` | — | |

## States

Static. It has no interactive state of its own; anything interactive lives in `children`.

## A11y

- `role` is set by **meaning, not colour**: `warning`/`danger` interrupt (`alert`), `success`
  is announced politely (`status`), `info` announces nothing because it is page content
  rather than an event.
- The icon is `aria-hidden` — the words already carry the meaning, and the role carries the
  urgency. Announcing it too doubles up.
- The title is a `<p>`, never a heading: an alert sits inside someone else's section and an
  injected `<h2>` breaks `heading-order`. Same rule as [EmptyState](empty-state.md).
- All four tone pairs (`*-on-soft` on `*-soft`) are in `scripts/contrast-pairs.mjs` already
  and clear 4.5:1 at all 360 brand hues in both themes.

## Do / Don't

**Do** use `warning` for anything the user must decide about. It is the most common tone in
this app and it should be.

**Do** put actions inside `children` so they sit within the coloured surface and read as part
of the message.

**Don't** reach for `danger` because something feels important. `--destructive` is reserved
for destructive actions and hard failures. A duplicate-patient warning, a missing DNS record
and a failed test send are all `warning` — the rule
[EmptyState's doc](empty-state.md) calls binding is that red beside a patient's name reads as
*the patient* being in trouble, not the data.

**Don't** use this for a per-field validation message. That belongs in [Field](field.md),
next to the input, where the fix is.

**Don't** use it for "saved" when the saved thing is visible on screen — that is what a toast
is for. See [05-patterns/forms.md](../05-patterns/forms.md).

## Example

```tsx
<InlineAlert tone="warning" title="This may already be a patient">
  <p>Maria Santos has the same email and date of birth, last seen 12 Mar 2026.</p>
  <Button asChild variant="outline" className="mt-2 min-h-11">
    <Link href="/patients/abc">Open Maria&apos;s record</Link>
  </Button>
</InlineAlert>
```
