# Button

> shadcn primitive on our tokens, added in Phase 1.2. [ui/button](../../../src/components/ui/button.tsx) · [gallery](/design-system#button)

Documented because every screen uses it and because our target-size rule is stricter than
the primitive's defaults.

## Variants
`default` (primary action) · `secondary` · `outline` · `ghost` · `destructive` · `link`.

`destructive` is for archive/void actions. Per 00-principles these get **deliberate
friction** — top placement plus a confirm sheet — never a one-tap destructive button in a
thumb zone.

## Props
Standard shadcn: `variant`, `size`, `asChild`, plus native button props.

## States
Default · hover · focus-visible (2px offset ring from `--ring`) · disabled (`opacity-50`,
pointer-events off) · loading (in-button spinner + `aria-busy`, never a skeleton).

## A11y
- **Add `min-h-11` in app usage.** The shadcn default (`h-9`) is below our 2.75rem floor.
  The gallery specimens show this explicitly.
- `asChild` when rendering a link — a navigation styled as a button must still be an `<a>`.
- Icon-only buttons need an `aria-label` and a visible focus ring.

## Do / Don't
**Do** keep one primary action per view.
**Don't** disable a submit button to indicate loading without `aria-busy` — screen readers
otherwise announce nothing.
**Don't** use `destructive` for "Archive" without a confirmation step.

## Example
```tsx
<Button className="min-h-11">Book a visit</Button>
<Button asChild variant="outline" className="min-h-11"><Link href="/book">Book</Link></Button>
```
