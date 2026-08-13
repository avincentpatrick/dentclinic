# AdminSectionGrid

> Built in Phase 2.2a. [src/components/admin/AdminSectionGrid.tsx](../../../src/components/admin/AdminSectionGrid.tsx) · [gallery](/design-system#admin-hub)

The card grid on `/admin` — one card per area of clinic configuration, whether or not that
area has been built yet.

## Anatomy

```
<ul class="grid sm:grid-cols-2">
  └── <li>
        └── <Link> | <div>          link when href is present, plain div when not
              ├── <span>            icon chip — primary when live, secondary when not
              └── <span>
                    ├── title       <span class="block font-medium">
                    ├── description one sentence
                    └── availability "Available" | "Arrives in Phase 2.2c — …"
```

No `<h2>` per card, deliberately: seven headings for seven one-line cards makes the heading
outline noisier than the page. [PageHeader](page-header.md) owns the only heading here.

## Variants

There is one variant, and **it is not a prop** — it is derived from whether the section
carries an `href`:

| Section shape | Renders as | Focusable |
|---|---|---|
| has `href` | `<Link>`, primary icon chip, hover state | yes |
| no `href` | `<div>`, secondary icon chip, no hover | **no** |

The component takes no `disabled` prop and there is no way to pass one. An unbuilt section
is unrepresentable as a link — the same "make the bug impossible in the type" move
[StatusChip](status-chip.md) uses by deriving its label and icon from the status key.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `sections` | `readonly AdminSection[]` | — | required; normally the real `ADMIN_SECTIONS` |

`AdminSection` lives in [src/lib/admin/sections.ts](../../../src/lib/admin/sections.ts) — pure
data, no JSX, so the gallery specimen renders the **real** list rather than a fixture. That is
what makes this composition worth testing: a section added without an `href` is proven
non-clickable by the same array the page uses.

## States

**default · hover · focus-visible.** No loading state — the list is a module constant, so
there is nothing to wait for. No empty state: an empty admin hub would be a bug, not a case.

## A11y

- Unbuilt cards are **not focusable and not `<button disabled>`**. There is nothing to
  activate, so a tab stop there would be a stop that does nothing.
- Availability is always **spelled out**. Muted styling is the redundant signal, not the only
  one (WCAG 1.4.1) — "greyed out" is not information.
- Icons are `aria-hidden`; the title carries the meaning.
- Cards are `min-h-11` and the whole card is the target, not just the title text.
- Only pairs declared in [contrast-pairs.mjs](../../../scripts/contrast-pairs.mjs) are used:
  `primary-foreground/primary`, `secondary-foreground/secondary`, `foreground/card` and
  `muted-foreground/card`. The last of those was **added to the contrast contract in 2.2a** by
  this component — `--card` is a different lightness from `--background`, so the existing
  `muted-foreground/background` pair did not cover it.

## Do / Don't

**Do** leave unbuilt sections in the list. The hub doubles as the roadmap: a superadmin
hunting for "where do I change the cancellation reasons" is better served by "Arrives in Phase
2.2b" than by silence, which reads as "this product cannot do that".

**Don't** give a section an `href` before its page exists. That is precisely the bug this
component was written to prevent — `/admin` itself 404'd from Phase 1.2 to Phase 2.2a because
`nav.ts` linked to a route nobody had built.

**Don't** use `bg-card/50` or any other alpha-modified surface to dim a card. An
alpha-composited colour is not a token, so `check:contrast` never sweeps it.

**Don't** invent phase numbers for the availability line. Cite one only where PLAN.md or a
module doc actually commits to it; otherwise name the module ("Arrives with the audit
viewer").

## Example

```tsx
import { AdminSectionGrid } from "@/components/admin/AdminSectionGrid";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";

<PageHeader title="Clinic settings" description="Everything this installation configures about itself." />
<AdminSectionGrid sections={ADMIN_SECTIONS} />
```
