# SoftDeleteMenu

> Built in Phase 2.1. [src/components/shared/SoftDeleteMenu.tsx](../../../src/components/shared/SoftDeleteMenu.tsx) · [gallery](/design-system#soft-delete-menu)

Archive and Restore for one row. The word "Delete" does not appear, because the operation
does not exist — see [05-patterns/soft-delete.md](../05-patterns/soft-delete.md).

## Anatomy

```
<DropdownMenu>
  └── trigger            ghost icon button, size-11, aria-label="Actions for {label}"
  └── content
        ├── Archive      → opens the confirmation
        └── Restore      → a <form action={restoreAction}>, no confirmation
<AlertDialog>            "Archive Maria Santos?" + Cancel / Archive
```

## Variants

Two, driven by `archived`. An archived row offers **Restore**; a live row offers **Archive**.
Never both — a row is one or the other, and rendering both invites the wrong click.

## Props

| Prop | Type | Notes |
|---|---|---|
| `label` | `string` | the record's name, used **verbatim** in the confirmation |
| `archived` | `boolean` | picks the variant |
| `archiveAction` | `() => Promise<void>` | server action, pre-bound to the row id by the caller |
| `restoreAction` | `() => Promise<void>` | same |

Binding the id in the caller keeps the row id out of the client bundle and off the DOM.

## States

**closed · menu open · confirming · submitting.** Submitting is the form's own pending state;
the dialog closes when the server re-renders the list.

## A11y

- The trigger is `size-11` (44px) and carries `aria-label="Actions for {label}"` — a bare
  "Actions" repeated down a roster is useless to a screen-reader user scanning rows.
- `AlertDialog`, not `Dialog`: archiving is a consequential action, so it takes focus and
  requires an explicit choice.
- The icon is `aria-hidden`; the menu items carry real text.
- Both dialog buttons are `min-h-11`.

## Do / Don't

**Do** name the record in the confirmation. "Archive Maria Santos?" is checkable at a glance;
"Are you sure?" is not — and on a roster of similar names, the wrong-row mistake is exactly
what this guards against.

**Do** leave Restore unconfirmed. It is not destructive, and friction on the undo path is how
a reversible mistake becomes irreversible.

**Don't** add a "Delete permanently" item. There is no DELETE grant on any table; the item
would fail at the database, which is the correct outcome but a terrible way to discover it.

**Don't** make this the only way to restore something. A Radix dropdown cannot open without
JavaScript, so this control is JS-only — acceptable *only* because the roster's Archived
filter is a plain link and restoring from there is a plain form. Nothing may be reachable
exclusively through this menu.

**Don't** use `--destructive` styling. Archiving is reversible and the record is not being
harmed; red here would misrepresent the stakes, the same reasoning
[EmptyState](empty-state.md) applies to its error register.

## Example

```tsx
<SoftDeleteMenu
  label={patient.full_name}
  archived={Boolean(patient.deleted_at)}
  archiveAction={archivePatient.bind(null, patient.id, returnTo)}
  restoreAction={restorePatient.bind(null, patient.id, returnTo)}
/>
```

`returnTo` is the caller's current list URL, built server-side from the already-parsed roster
params (`/patients?q=santos&page=2`). Binding it is what makes archiving return the user to
the filtered page they were on instead of an unfiltered page 1 — and the action re-validates
it before redirecting, because it is the one redirect target in the app that is not a literal.

The props stay `() => Promise<void>`: `.bind` with extra arguments still produces exactly that
signature.
