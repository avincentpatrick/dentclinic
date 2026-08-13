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

## Contributing a *screen* — the `layouts` group

Since Phase 2.2a the registry also carries `group: "layouts"`: whole-page compositions, which
is how authenticated screens get axe coverage without a second bypass route. `GALLERY_GROUPS`
is iterated by [tests/a11y/design-system.spec.ts](../../tests/a11y/design-system.spec.ts), so
an entry here is tested across 2 themes × 4 font steps automatically.

**The rule that keeps it honest: a layouts entry composes the presentational pieces the real
screen also renders — never a re-typed copy of the page.** A copy drifts within one increment
and then proves nothing. In practice that means splitting a screen in two:

| Real screen | Presentational piece | The specimen renders |
|---|---|---|
| `/admin` | `AdminSectionGrid` (props-only) | the grid, with the **real** `ADMIN_SECTIONS` |
| `/admin/branding` | `BrandingForm` with an injected `action` | `BrandingFormSpecimen`, a no-op action |

Two constraints fall out of the eslint ban on `@/lib/supabase/*`, `@/app/actions/*` and
`@/lib/auth/*` inside `src/components/gallery/**`:

- **A form built on `useActionState` needs an `action` it cannot be given**, so it needs a
  `"use client"` wrapper in `specimens/` supplying a no-op — `registry.tsx` is a Server
  Component and passing a function from there throws "Functions cannot be passed directly to
  Client Components".
- **Anything needing a server action must degrade visibly.** `BrandingForm` takes
  `mintUploadUrl` as an *optional* prop; with it absent the file picker renders disabled, which
  is the honest representation of a control that needs a server, rather than one that looks
  live and silently does nothing.

Give the form an `initialState` prop if you want its error and success renderings in the
matrix. `BrandingForm` has one; `PatientForm` does not, which is why its error states are
still unproven.

Other rules: no `<main>` in a composition (the gallery page already has one); keep it to one
specimen per state and three fixture rows, not twenty-five; and point `doc:` at the **owning
module doc** rather than inventing an `04-components/*.md` for a screen — `check:docs` only
asserts the path exists, and the anatomy of an admin screen belongs in its module doc.

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
