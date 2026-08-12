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

Sizes: `sm` (h-6, dense tables and calendar cells) and `md` (h-7, default).

## Props

| Prop | Type | Default |
|---|---|---|
| `status` / `level` | `StatusKey` / `ClinicalLevel` | required |
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
