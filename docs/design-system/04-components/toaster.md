# Toaster

> Built in Phase 2.1c. [src/components/shared/Toaster.tsx](../../../src/components/shared/Toaster.tsx) ·
> [ToastOnMount](../../../src/components/shared/ToastOnMount.tsx) · [gallery](/design-system#toaster)

Transient confirmation for a result you cannot see on the current view. One `<Toaster />`
is mounted in [AppShell](app-shell.md); `ToastOnMount` is how a Server Component fires one.

## Anatomy

```
<Toaster>                       sonner, mounted once in AppShell
  └── toast
        ├── title               "Patient archived"
        ├── description         "The record is out of the active list. Nothing was deleted."
        ├── actionButton        "Undo"  (min-h-11)
        └── closeButton         (size-11)

<ToastOnMount token=… />        rendered by a Server Component when a one-shot
                                search param is present; renders null
```

## Variants

| | When |
|---|---|
| title only | a result with nothing to decide |
| title + description | the common case — say what happened *and* what it did not do |
| + action | an Undo or a "View it", never a required decision |

## Props

**`Toaster`** takes none. That is deliberate: position, duration and the token mapping are
app-wide decisions, not per-call-site ones.

**`ToastOnMount`**

| Prop | Type | Notes |
|---|---|---|
| `token` | `string` | sonner's toast `id` **and** the effect's dependency. Makes the toast idempotent under StrictMode's double-invoke and under re-render. |
| `title` / `description` | `string` | |
| `actionLabel` | `string?` | with `undoPatientId`, renders the action button |
| `undoPatientId` | `string?` | calls `restorePatientById` in a transition |
| `clearParam` | `string?` | the search param to strip after firing (default `"undo"`) |

## States

**fired · paused · dismissed · expired.** sonner pauses its own timer on hover and on focus.
There is no loading state — a toast reports something that already happened.

## A11y

- **WCAG 2.2.1 (Timing Adjustable).** A disappearing Undo *is* a time limit. Three things
  together satisfy it, and all three are required: `duration` is 10s rather than the 4s
  default; the timer pauses on hover and focus and there is a close button; and **the action
  is always reachable another way with no time limit at all** — for archive that is the
  roster's Archived filter → the row's [SoftDeleteMenu](soft-delete-menu.md) → Restore.
- A toast is **never the only feedback**. It is invisible with JavaScript off, and the
  archive still happens in that case — the row leaves the roster, which is the real
  confirmation.
- The action button and close button are `min-h-11` / `size-11` like every other target.
- sonner renders the region with `aria-live`; announcements come from the title.

## Do / Don't

**Do** toast only when *all three* hold: the action succeeded, its result is **not visible on
the current view**, and no decision is required ([forms.md](../05-patterns/forms.md)).

**Do** say what did *not* happen when the word could alarm — "Nothing was deleted" belongs in
an archive toast, because "archived" reads as "gone" to someone who has not read the
soft-delete doc.

**Don't** toast a create that redirects to the created record. The record on screen *is* the
confirmation; a toast on top of it is noise.

**Don't** toast anything that needs a decision — that is an [InlineAlert](inline-alert.md),
which persists while the user works.

**Don't** let a toast be the only path to an action it offers. See A11y.

**Don't** run `npx shadcn add sonner` and take the template. It imports `useTheme` from
`next-themes`, which this repo does not use: theme is a cookie plus a `.dark` class on
`<html>`, resolved in CSS so it survives JavaScript being off. Our `Toaster` pins sonner's
own theme to `light` and does nothing with it — the colours come from `--popover`,
`--popover-foreground` and `--border`, which resolve correctly in both themes because custom
properties resolve where they are *declared*. That also keeps the toast inside
`check:contrast` instead of carrying a palette nothing verifies.

**Don't** call `router.replace()` to clear the one-shot param. It refetches the dynamic route
— a second full RSC render — and can swap the tree out from under the open toast.
`history.replaceState` just edits the URL.

## Example

```tsx
// the action
redirect(safeReturn(returnTo, { undo: id }));

// the Server Component
{undoId && (
  <ToastOnMount
    token={undoId}
    title="Patient archived"
    description="The record is out of the active list. Nothing was deleted."
    actionLabel="Undo"
    undoPatientId={undoId}
  />
)}
```

The param carries a bare UUID and nothing else — no name, no patient number. That is the same
exposure class as `/patients/<id>`, which already exists, and forms.md forbids PHI in a query
string.
