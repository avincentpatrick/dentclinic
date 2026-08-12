# Typography

> LIVE since Phase 1.1. Source: [src/app/globals.css](../../src/app/globals.css), [src/lib/appearance.ts](../../src/lib/appearance.ts).

## Fonts

`Geist` (sans) and `Geist Mono`, loaded via `next/font/google` in the root layout, which
defines `--font-geist-sans` / `--font-geist-mono`. `@theme inline` bridges those to
Tailwind's `--font-sans` / `--font-mono` / `--font-heading`.

> **Fixed in 1.1:** `@theme inline` previously declared `--font-sans: var(--font-sans)` —
> self-referential — so `font-sans` resolved invalid and the app rendered in the browser
> default font, not Geist, for all of Phase 0. Each family now ends in a real system stack.

## The four font steps

One root `font-size`, four steps, everything downstream in `rem`:

| Step | Root size | Effective base |
|---|---|---|
| `standard` | 100% | 16px |
| `comfortable` | 112.5% | 18px |
| `large` | 125% | 20px |
| `xlarge` | 137.5% | 22px |

**Percentages, not pixels.** A user who has set their browser to 20px keeps that scale —
`112.5%` gives them 22.5px. Hard-coding `18px` would silently override an accessibility
setting the user already made, which is worse than not offering the control at all.

### The selector must stay bare

```css
[data-font-size="comfortable"] { font-size: 112.5%; }   /* correct */
html[data-font-size="comfortable"] { … }                /* WRONG — do not do this */
```

`<html>` carries the attribute globally, but the `/design-system` gallery (Phase 1.2) must
render all four steps **on one page**, which requires nesting. An `html`-scoped selector
makes that impossible. Because the values are percentages, a nested pane composes
relative to its parent — which is exactly the behaviour we want.

## `auto` — the fifth preference value

The stored preference is five-valued; only four ever reach the DOM:

```
FontPref = "auto" | "standard" | "comfortable" | "large" | "xlarge"
FontStep =         "standard" | "comfortable" | "large" | "xlarge"
```

`auto` (the default) resolves per-route: **patient surfaces get `comfortable` (18px)** for
health literacy, everything else gets `standard`. An explicit choice wins on every route,
for every role — a doctor who picks `large` keeps it on `/today`; a patient who picks
`standard` keeps it on `/home`. Route defaults only ever fill an *unset* preference.

`auto` has to exist as a distinct value rather than seeding the cookie on first visit:
a patient whose first hit is the landing page would otherwise be pinned to 100% forever.

**Resolution is pathname-based, not role-based**, and that is load-bearing — `/book` and
`/a/[token]` are patient-facing with **no session at all**, so a role check would serve
guest booking at 100%. `PATIENT_SURFACES` is the list; middleware forwards the pathname
to the root layout as `x-pathname` because a Server Component cannot see it.

Because the root layout does not re-render on client-side navigation, `AppearanceProvider`
re-derives the step from `usePathname()` and updates the attribute. The server gets first
paint right; the provider keeps it right thereafter.

## Rules

- **Everything in `rem`.** Tailwind v4's `--spacing` is rem-based, so spacing, radius, and
  type all scale together with the step. No action needed — just never write `px`.
- **Form controls must never be smaller than `1rem`.** `text-sm` on an `<input>` triggers
  iOS zoom-on-focus at the standard step.
- **Breakpoints do NOT scale.** `rem` inside a media query always means 16px, so at 137.5%
  content grows but the layout does not reflow. Prefer `@container` for component-level
  responsiveness (Phase 1.2 onward). This is a known limitation, not a bug to chase.
- Headings use `--font-heading` (currently the same family as body); weight and size carry
  the hierarchy, never colour alone.
