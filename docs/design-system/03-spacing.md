# Spacing & Radius

> LIVE since Phase 1.1. Source: [src/app/globals.css](../../src/app/globals.css).

## Spacing

Tailwind v4's default `--spacing: 0.25rem` scale, unmodified. Because it is **rem-based it
scales with the font step automatically** — `p-4` is 16px at `standard` and 22px at
`xlarge`. That is the intent: a user who needs bigger text needs bigger touch targets and
looser rhythm too.

Never author `px`. The one legitimate exception is a hairline border (`1px`), which should
not scale.

## Radius

`--radius: 0.625rem` (10px at standard), with a multiplicative ladder in `@theme inline`:

| Token | Value | Typical use |
|---|---|---|
| `--radius-sm` | `calc(--radius * 0.6)` | chips, badges, small inputs |
| `--radius-md` | `calc(--radius * 0.8)` | buttons, inputs |
| `--radius-lg` | `--radius` | cards, popovers |
| `--radius-xl` | `calc(--radius * 1.4)` | sheets, dialogs |
| `--radius-2xl`–`4xl` | up to `× 2.6` | hero surfaces, decorative |

Note this is the `radix-nova` multiplicative ladder, not stock shadcn's subtractive
`calc(var(--radius) - 4px)`. There is no `--radius-xs`.

## Touch targets

**≥ 2.75rem (44px) for anything interactive.** Authored in rem so it grows with the font
step. WCAG 2.2 SC 2.5.8 sets a 24px floor; 44px is the iOS/Material guidance and the one
we hold ourselves to, because this app is used one-handed on a phone at a reception desk.

Reach for `min-h-11` (2.75rem) rather than padding math — padding-derived heights drift
when the font step changes.

## Safe areas

The root layout sets `viewportFit: "cover"`, which is what makes `env(safe-area-inset-*)`
non-zero on notched devices. Anything pinned to the bottom must add
`pb-[env(safe-area-inset-bottom)]`, and any scroll container above it must reserve
`calc(4rem + env(safe-area-inset-bottom))`.

## Focus is never obscured

```css
html { scroll-padding-bottom: calc(4rem + env(safe-area-inset-bottom)); }
```

One line in `globals.css`, and it is what stops a keyboard-focused element at the bottom
of a page from scrolling underneath the sticky tab bar (WCAG 2.2 SC 2.4.11 Focus Not
Obscured). It is set in 1.1, ahead of the tab bar itself in 1.2, so the guarantee exists
before anything can violate it.

## Layout widths

Content columns are capped per surface, not globally: `max-w-lg` for patient reading
surfaces, `max-w-3xl` for staff day views, `max-w-5xl` for admin dashboards. These move
into the shell layouts in Phase 1.2.
