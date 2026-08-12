# Skeleton

> Built in Phase 1.2. [ui/skeleton](../../../src/components/ui/skeleton.tsx) · real usage: [UserChip.skeleton.tsx](../../../src/components/shell/UserChip.skeleton.tsx) · [gallery](/design-system#skeleton)

Loading placeholders for **content**. Actions get in-button spinners, never skeletons.

## Anatomy
A sibling file per async component:
```
UserChip.tsx           the real thing
UserChip.skeleton.tsx  exports UserChipSkeleton — same box model
```

## Variants
The primitive is a single `<div>`. The meaningful variation is per-component: each skeleton
mirrors its own component's layout.

## Props
Primitive takes `className` only. Component skeletons take whatever layout props change
their shape — `UserChipSkeleton` takes `collapsed` so it matches the sidebar rail.

## States
- **Pulsing** — `animate-pulse motion-reduce:animate-none`. No shimmer: 00-principles bans
  shimmer under reduced motion, and a pulse is cheaper and degrades to a static block.
- **Resolved** — replaced by the real component. If anything shifts, the skeleton's box
  model is wrong.

## A11y
- Skeleton root is `aria-hidden="true"`. The Suspense boundary's container carries
  `aria-busy`. An announced skeleton is screen-reader noise.
- Never put text inside a skeleton.

## Do / Don't
**Do** mirror the real component's heights, paddings and row count exactly — the entire
point is that nothing moves when data arrives.
**Do** ship the skeleton in the same commit as the async component.

**Don't** use a generic grey rectangle for a complex component; that guarantees layout shift.
**Don't** use a skeleton for a button press — that is an in-button spinner plus `aria-busy`.
**Don't** use one where an EmptyState belongs: a skeleton means "loading", not "nothing".

## Example
```tsx
<Suspense fallback={<UserChipSkeleton collapsed={collapsed} />}>
  <UserChip collapsed={collapsed} />
</Suspense>
```
