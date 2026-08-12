# Pattern: Skeletons & loading

> Written in Phase 1.2. Component: [Skeleton](../04-components/skeleton.md).

## The rule

**Skeletons for content. In-button spinners for actions. Never the reverse.**

A skeleton says "this region will contain something". A spinner says "your action is in
flight". Swapping them makes a button look broken and a page look frozen.

## The six conventions

1. A component that renders server-fetched data ships a sibling `<Name>.skeleton.tsx`
   exporting `<Name>Skeleton`.
2. The skeleton **mirrors the real component's box model** — same heights, paddings, row
   count. Not a generic grey rectangle. If anything shifts on resolve, the skeleton is wrong.
3. Used as `<Suspense fallback={<NameSkeleton />}>`, and/or re-exported from a route's
   `loading.tsx`.
4. `animate-pulse motion-reduce:animate-none`. **No shimmer** — 00-principles bans shimmer
   under reduced motion, and a pulse is cheaper and degrades to a static block.
5. `aria-hidden="true"` on the skeleton root; the boundary's container carries `aria-busy`.
   An announced skeleton is screen-reader noise.
6. Ship the skeleton in the same commit as the component. A skeleton added later is a
   skeleton whose box model has already drifted.

## No optimistic UI for booking or clinical writes — ever

00-principles is absolute on this: a booking that appears to succeed and then fails at the
DB EXCLUDE constraint is worse than a two-second wait. Optimistic UI is permitted only for
low-risk toggles — appearance preferences are the canonical example, which is why
`AppearancePanel` mutates the DOM before persisting.

## Phase 1 reference implementation

`UserChip` (async server component, queries `profiles`) sits behind a `<Suspense>` in
`AppShell` with `UserChipSkeleton`. The shell paints instantly; the identity fills in. That
is the shape every async component should copy.
