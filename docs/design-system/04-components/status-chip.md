# StatusChip / ClinicalChip

> Built in Phase 1.2. [src/components/shared/StatusChip.tsx](../../../src/components/shared/StatusChip.tsx) · [gallery](/design-system#status-chip)

Appointment status and clinical severity. **Never colour alone** — always chip + label + icon.

## Anatomy

```
<span>                 rounded-full, soft background, 1px inset ring
  ├── <Icon />         aria-hidden — the label already carries the meaning
  └── label            derived from the status, not passed in
```

## Variants

`StatusChip` takes `status`; `ClinicalChip` takes `level`. Two exports rather than one
union prop so the two vocabularies can never be passed to each other.

| `status` | Icon | Label |
|---|---|---|
| `scheduled` | CalendarClock | Scheduled |
| `confirmed` | CalendarCheck2 | Confirmed |
| `in-chair` | Armchair | In chair |
| `completed` | CircleCheck | Completed |
| `no-show` | UserX | No-show |
| `cancelled` | CalendarX2 | Cancelled |

| `level` | Icon | Label |
|---|---|---|
| `healthy` | ShieldCheck | Healthy |
| `watch` | CircleAlert | Watch |
| `urgent` | TriangleAlert | Urgent |

### `RecordChip` (Phase 2.1c)

A third vocabulary, for the state of the **row** rather than of a visit or a diagnosis.

| `state` | Icon | Label |
|---|---|---|
| `archived` | Archive | Archived |
| `provisional` | CircleDashed | Provisional |

Why not two more `StatusKey` values: `STATUS_KEYS` means "what is happening with this
appointment" and drives the gallery loops and the a11y matrix. Folding "archived" in would
make `<StatusChip status="archived" />` renderable on a calendar cell. Same reason
`ClinicalLevel` is separate.

**Neutral tokens** (`bg-muted` / `text-muted-foreground` / `ring-border`), not a warning
colour. Archiving is reversible and routine — and a coloured chip beside a patient's name
reads as something being wrong with the *patient*, not with the record.

Sizes: `sm` (h-6, dense tables and calendar cells) and `md` (h-7, default).

## Props

| Prop | Type | Default |
|---|---|---|
| `status` / `level` / `state` | `StatusKey` / `ClinicalLevel` / `RecordState` | required |
| `size` | `"sm" \| "md"` | `"md"` |
| `className` | `string` | — |

**There is deliberately no `label`, `children`, or `color` prop.** Label and icon are
derived from the status, which makes a colour-only chip — or one whose text disagrees with
its colour — unrepresentable in the type system. That is a stronger guarantee than a lint
rule or a review checklist.

## States

Static. Status *changes* are announced by the call site: wrap the chip in a live region
when it updates in place (Phase 3's queue board), not here — a chip in a list is content,
not a live region, and `role="status"` on every chip would flood the buffer.

## A fourth vocabulary: feedback (2.2d)

`FeedbackStatusChip` and `FeedbackSeverityChip` join `StatusChip`, `ClinicalChip` and
`RecordChip`, on the same terms: separate types, so `<StatusChip status="wont_fix" />` is
unrepresentable and report statuses stay out of `STATUS_KEYS`, which drives the gallery loops
and the a11y matrix.

```tsx
<FeedbackStatusChip status="in_progress" />
<FeedbackSeverityChip severity="blocker" size="sm" />
```

Two constraints shaped the palette:

- **No new colour tokens.** Every pair reuses one of the 13 already swept by
  `npm run check:contrast` across all 360 brand hues, or the neutral `muted`/`border` pair.
  07-contributing.md's rule is that an unlisted token is an unproven token, and the cheapest
  way to satisfy it is not to invent one.
- **`--destructive` is not used**, even for `blocker`. It is reserved for destructive
  *actions*; a severity describes a report, it does not threaten data.

That leaves three attention levels for six statuses, so some colours repeat — `triaged` and
`in_progress` are both `info`, and three statuses share the neutral pair. This is not a
colour-only chip: WCAG 1.4.1 forbids colour as the **only** signal, and every chip here still
carries a distinct label and a distinct icon.

The chip labels are short (`Blocker`) where the form's picker asks a question and answers it in
a sentence (`Blocking my work`). Those live in `src/lib/feedback/schema.ts` and are not
duplication — two contexts, two strings, on purpose.

## A11y

- Icon is `aria-hidden`; the visible text is the accessible name.
- Colour is never the only signal: shape (pill), icon, and text all carry it.
- Every soft/on-soft pair is verified ≥4.5:1 in both themes by `npm run check:contrast`.
- Ring is `color-mix`-free — a plain `/25` alpha on the solid token, which composites over
  the soft background and is included in the contrast sweep as a UI-level pair.

## Do / Don't

**Do** use `deriveStatus()` (Phase 3) to map DB rows to a `StatusKey`.
**Do** pick `sm` inside dense tables so rows stay scannable.

**Don't** invent a status. The six keys are the presentation vocabulary; if a new DB state
appears, map it to an existing key or extend both the token set and the contrast pair list.
**Don't** map DB enums at the call site — see the seam below.

## The DB seam

The DB enums are **not** 1:1 with these six keys:

- `cancelled` and `no-show` are **both** `appt_status = 'broken'`, distinguished by reason
- `in-chair` comes from `visit_status`, not `appt_status`
- `confirmed` comes from `confirm_status`

`src/lib/status/derive.ts` owns that mapping. It throws in Phase 1 by design — implement
it in Phase 3 with the real `appointments` shape rather than letting each call site guess.

## Example

```tsx
<StatusChip status="confirmed" />
<StatusChip status="in-chair" size="sm" />
<ClinicalChip level="urgent" />
```
