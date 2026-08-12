# Contributing a Component

> LIVE since Phase 1.2.

## The checklist

1. **Build it** in `src/components/<group>/<Name>.tsx`.
2. **Skeleton sibling** — `<Name>.skeleton.tsx` if it renders server-fetched data
   ([pattern](05-patterns/skeletons.md)).
3. **Doc** — `docs/design-system/04-components/<kebab-name>.md`, written *now*, not later.
4. **Registry entry** — `src/components/gallery/registry.tsx`, with `doc:` pointing at the
   file from step 3.
5. **Contrast pairs** — if it introduces a colour token, add its fg/bg pair to
   `scripts/contrast-pairs.mjs`. An unlisted token is an unproven token.
6. **Verify** — `npm run check && npm run test:a11y`.

Steps 3 and 4 are enforced: `npm run check:docs` fails if a registry entry points at a
missing doc **or** if a doc has no registry entry. Both directions, so a doc cannot outlive
the component it describes.

## Doc template

```markdown
# ComponentName

> Built in Phase X.Y. [source](path) · [gallery](/design-system#id)

One sentence on what it is for.

## Anatomy      ASCII tree of the parts
## Variants     table — what varies and why
## Props        table — name, type, default, notes
## States       default / hover / focus / loading / error / empty
## A11y         roles, labels, keyboard, target size, contrast notes
## Do / Don't   the rules that will otherwise be broken
## Example      minimal real usage
```

Write the **Don't** section from real mistakes, not hypotheticals. "Don't use `--destructive`
for the error empty state" is useful; "Don't misuse this component" is not.

## What gets a doc

**Custom components only.** shadcn primitives are not documented individually — the
exception is when our usage differs from the default in a way people must know
([Button](04-components/button.md) exists because our 44px floor overrides shadcn's `h-9`).

## Gallery rules

- **Fixtures only.** Specimens must never import `@/lib/supabase/*` or `@/app/actions/*`.
  Enforced by eslint, because `/design-system` is the one route with an audit bypass and its
  blast radius has to be zero by construction. See [06-accessibility.md](06-accessibility.md).
- Specimens should cover **every variant**, not a representative one — `?matrix=all` renders
  each specimen across both themes × four font steps, and that combined page is the
  acceptance surface.
- A component that only makes sense in situ (the shell, the idle guard) gets a registry
  entry with an empty `specimens` array and a note pointing at the live instance.

## Conventions

- Sizing in **rem**. Interactive targets `min-h-11` (2.75rem).
- Colour only from tokens — never `text-red-600`, never a hex, never inline `oklch()`.
- Status is chip + label + icon. Never colour alone.
- Variants via `cva`; merge classes with `cn`.
- Derive labels/icons from a typed key rather than accepting them as props where a wrong
  pairing would be a correctness bug (see [StatusChip](04-components/status-chip.md)).
- Client components only when they need state, effects, or event handlers — the shell is a
  Server Component and should stay one.
