# Tokens

> LIVE since Phase 1.1. Source: [src/app/globals.css](../../src/app/globals.css). Enforced by [scripts/check-contrast.mjs](../../scripts/check-contrast.mjs).

Every colour in the app comes from a token. No component may write a raw colour
(`text-red-600`, `#0ea5e9`, `oklch(...)` inline). Two axes theme the whole system:
**`--brand-hue`** (one number, from the database) × **`.dark`**.

## How it works

Three layers, in this order:

1. **`--brand-hue`** — a single number injected as an inline style on `<html>` by the
   root layout, read from the public `clinic_branding` view. Registered with
   `@property … syntax:"<number>"` so a malformed settings value falls back to the
   initial value instead of invalidating every colour in the document.
2. **Two ladders** — lightness (`--l-*`) and chroma (`--c-*`). `.dark` rewrites
   **only the lightness ladder plus the `--c-tint` multiplier**. That is the
   "lightness flip" in practice.
3. **Tokens** — each written **once** as `oklch(var(--l-x) var(--c-x) var(--brand-hue))`.
   Because `:root` and `.dark` both match `<html>`, substitution happens there and the
   entire palette recomputes from the flipped ladder.

Consequences worth knowing:

- **No token is ever redeclared per theme.** Adding a token means adding one line, not two.
- **Rebranding requires no rebuild and no CSS regeneration** — change the DB row, reload.
  Verified live on 2026-08-12 by flipping the hue to 25 and back with no deploy.
- Because `.dark` is a plain class, a nested `<div class="dark">` re-declares the ladder
  for its subtree. The Phase 1.2 `/design-system` gallery gets side-by-side light/dark
  rendering for free.

## The ladders

| Rung | Light L | Dark L | Used by |
|---|---|---|---|
| `canvas` | 0.985 | 0.165 | `--background` |
| `surface` | 0.995 | 0.205 | `--card`, `--popover`, `--sidebar` |
| `raised` | 0.955 | 0.265 | `--secondary`, `--muted`, `--accent` |
| `line` | 0.905 | 0.305 | `--border` (decorative) |
| `line-strong` | 0.645 | 0.515 | `--input` (control boundary, 3:1) |
| `dim` | 0.505 | 0.715 | `--muted-foreground` |
| `brand` | 0.500 | 0.720 | `--primary`, `--ring` |
| `on-brand` | 0.985 | 0.190 | `--primary-foreground`, `--on-solid` |
| `ink-soft` | 0.320 | 0.900 | `--secondary-foreground` |
| `ink` | 0.210 | 0.965 | `--foreground` |

`--c-tint` is `1` in light and `2.2` in dark: dark surfaces need more chroma to read as
tinted at all, because perceived saturation falls with lightness.

### Why `--border` and `--input` are different tokens

Stock shadcn uses one `--border` at ~1.3:1 against the background. That is fine for a
divider and **fails WCAG 1.4.11** for a form-control edge. We split them: `--border` is
decorative, `--input` is the 3:1 boundary used by anything interactive. If you are
drawing the edge of a control, use `--input`.

## Semantic tokens are FIXED-HUE — never `--brand-hue`

This is the one deliberate exception to "everything references `--brand-hue`", and it is
not negotiable:

1. **Safety.** `--clinical-urgent` is a patient-safety signal. Derived from the brand, a
   clinic that picks hue 150 gets a *green* "urgent" allergy alert. That is a clinical
   hazard, not a theming bug.
2. **Meaning is learned; branding is not.** Staff learn "amber = watch" across thousands
   of chart opens. Rebranding must not retrain them.
3. **Collision.** If everything derived from one hue, `--status-scheduled` would equal
   `--primary` and the chip would be indistinguishable from every button on the page.
4. **They render outside the app** — emails (Phase 5), printed receipts (Phase 7) — where
   no brand hue is injected. Fixed values are the only ones that survive that trip.

They still share the **lightness ladder**, so `.dark` flips them for free.

There is also an engineering gain: because the hues are fixed, chroma is hand-tuned
per hue. An arbitrary brand hue must use the conservative all-hue-safe chroma; a fixed
hue can use `0.145` at red where cyan can only take `0.09`.

### The scale

Each semantic token is a **triplet**: solid (dot/icon/border), `-soft` (chip background),
`-on-soft` (chip text). Text on a solid fill is always `--on-solid`.

| Token | Hue | Chroma | Meaning |
|---|---|---|---|
| `--status-scheduled` | 250 | 0.11 | booked, not yet confirmed |
| `--status-confirmed` | 150 | 0.13 | patient confirmed |
| `--status-in-chair` | 295 | 0.14 | currently being treated |
| `--status-completed` | 250 | 0.02 | settled/neutral — deliberately not celebratory |
| `--status-no-show` | 55 | 0.12 | missed without notice |
| `--status-cancelled` | 20 | 0.045 | muted, **not** alarm red — cancelling is not a failure |
| `--clinical-healthy` | 150 | 0.13 | no action needed |
| `--clinical-watch` | 75 | 0.104 | monitor |
| `--clinical-urgent` | 27 | 0.145 | needs attention now |
| `--success` | 150 | 0.13 | |
| `--warning` | 75 | 0.104 | |
| `--info` | 250 | 0.11 | |
| `--destructive` | 27 | 0.15 | irreversible action |

`--c-watch` / `--c-warning` are `0.104`, not `0.11`: hue 75 is gamut-tight at `--l-sem`
and `0.11` overshoots sRGB. The contrast script catches this — don't "round it up".

**Status colour is never the only signal.** `StatusChip` (Phase 1.2) always renders
chip + label + icon. See [00-principles.md](00-principles.md).

## The contrast contract

`scripts/check-contrast.mjs` is the gate, and [`scripts/contrast-pairs.mjs`](../../scripts/contrast-pairs.mjs)
is the contract: the declared list of foreground/background pairs the UI may compose and
the level each must meet. **Adding a token without adding its pair means it is unproven.**

```
npm run check:contrast
```

It sweeps **52 pairs × 360 hues × 2 themes = 37,440 comparisons** in about a second, and
asserts three things:

1. every declared pair clears its level (text 4.5, large 3.0, UI 3.0) at **every** hue;
2. every token except `--primary`/`--ring`/`--chart-1` stays inside sRGB at every hue
   (an out-of-gamut colour renders browser-dependently and is therefore unproven);
3. the `.dark` block and the `prefers-color-scheme` block declare **identical** values —
   they are duplicated by necessity and would otherwise drift silently.

Luminance is computed under **naive channel clipping**, which is deliberately pessimistic:
browsers implementing CSS Color 4 reduce chroma at constant lightness instead, preserving
luminance better. If a pair passes here it passes in a real browser. `--selftest` verifies
the OKLab matrices against culori (agreement ~4e-9).

### Why not measure a rendered page?

Because `--brand-hue` is a runtime clinic setting. A browser check proves *one* hue. This
proves all 360. The two checks are complementary and both are required: **axe** (Phase 1.2)
catches bad *compositions* on real pages — `text-muted-foreground` on `bg-primary` — which
a palette sweep cannot see; **this** catches an unsafe *palette*, which a single rendered
page cannot see.

### Tightest pairs (worst case across all hues)

| Pair | Theme | Need | Worst | At hue |
|---|---|---|---|---|
| `input` / `background` | light | 3.0 | 3.13 | 175 |
| `input` / `card` | dark | 3.0 | 3.15 | 354 |
| `on-solid` / `status-confirmed` | light | 4.5 | 4.97 | fixed |
| `primary-foreground` / `primary` | light | 4.5 | 5.06 | 191 |
| `muted-foreground` / `muted` | light | 4.5 | 5.11 | 175 |

## A note on hue 195 (the shipped default)

Teal-cyan is the **tightest region of the sRGB gamut**: at `L=0.50` the maximum in-gamut
chroma at h195 is ≈0.086, versus ≈0.204 at red and ≈0.281 at blue. `--c-brand` is `0.13`,
which **deliberately overshoots** so red/blue/violet brands stay vivid; hues ≈175–235 are
gamut-mapped down by the browser. The practical effect: teal renders at teal's maximum
achievable saturation, which is less punchy than the same chroma at 250 would be. Every
contrast threshold is still met — this is a saturation ceiling, not a legibility problem.
If a clinic wants maximum vividness, 250 (blue) or 25 (terracotta) have the most headroom.
