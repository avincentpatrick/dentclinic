# Soft delete

> LIVE since Phase 2.1c. Component: SoftDeleteMenu.

Nothing in this system is ever deleted. The word does not appear in the UI, there is no
DELETE grant on any table, and every domain table carries `deleted_at` / `deleted_by`.

## Why, concretely

A deleted patient is a deleted appointment history, a deleted invoice, and an audit trail
with a dangling id. Clinics also make ordinary mistakes — archiving the wrong Maria Santos —
and the cost of that mistake should be one click, not a restore drill.

## The vocabulary

| Concept | Word in the UI | In the database |
|---|---|---|
| Remove from everyday view | **Archive** | `deleted_at = now(), deleted_by = auth.uid()` |
| Bring it back | **Restore** | `deleted_at = null, deleted_by = null` |
| Actually destroy | *(does not exist)* | no DELETE policy, no DELETE grant |

Never "Delete", never "Remove", never a trash-can icon. `Archive` is the word because it is
honest: the record still exists and can still be found.

## RLS shape

Patient-facing policies filter `deleted_at is null`, always, no exception.

Staff-side roles get a **second, explicitly named policy** permitting archived rows —
`"clinic reads archived patients (Archive view)"`. Permissive policies OR together, so the
practical grant equals one unfiltered policy; the split exists so the exception is legible in
`\d` output rather than hidden inside a missing predicate. Any new table with an Archive
affordance follows the same two-policy shape. See
[00-overview.md](../../modules/00-overview.md).

The UPDATE policy must **not** filter `deleted_at is null` in `USING` — archive and restore
are both UPDATEs, and a restore has to be able to target an archived row.

Unique constraints are partial (`WHERE deleted_at IS NULL`) so an archived record does not
block re-creating an equivalent live one. The exception is anything that must never be
reused — `patients.patient_number` is unique *without* the predicate, because a recycled
patient number is worse than a gap.

## The interaction

1. **Archive** lives behind a per-row menu (`SoftDeleteMenu`), never as a bare button in the
   row. Destructive-feeling actions get deliberate friction — 00-principles.md.
2. It opens an `AlertDialog` naming the record: "Archive Maria Santos?" Not "Are you sure?"
   — the confirmation must say *what*.
3. On success the row leaves the active list, and a toast offers **Undo**.
4. **Undo must also be reachable from the archived row itself.** Per WCAG 2.2.1 a toast is a
   time limit, and a toast is invisible with JavaScript off — so it is a convenience, never
   the only path back. The roster's "Archived" filter is the durable path.
5. Archived rows render with a `StatusChip`-style marker and muted styling, never colour
   alone.

## The wiring, concretely (2.1c)

```
SoftDeleteMenu → archivePatient.bind(null, id, returnTo)
  → role re-check → UPDATE deleted_at/deleted_by  (.is("deleted_at", null): idempotent)
  → revalidatePath("/patients") + revalidatePath("/patients/{id}")
  → redirect(returnTo + "&undo={id}")
      → the roster reads ?undo=, renders <ToastOnMount>
          → toast with Undo → restorePatientById(id)
```

Three things in that chain are easy to get wrong:

1. **`revalidatePath` is not optional, and it is new in this increment.** A Server Action does
   **not** refresh the list on its own; without it the client Router Cache can serve the
   pre-archive payload and the row appears not to have moved.
2. **`returnTo` is re-validated server-side** even though Next encrypts and signs bound action
   arguments. It is the only redirect target in the app that is not a literal, and
   `"//evil.example"` is a protocol-relative URL a naive `startsWith("/")` waves through.
   Carrying it at all is what makes archiving from `/patients?q=santos&page=2` return you
   *there* rather than to an unfiltered page 1.
3. **Restore gets no toast.** The row visibly rejoins the roster (or leaves the Archived
   filter), and [forms.md](forms.md) only sanctions a toast when the result is *not* visible
   on the current view.

Because the roster query never mixes archived rows into the active list, rule 5's "muted
styling" is carried at view level — an `InlineAlert` banner on the Archived view — plus a
`RecordChip state="archived"` on the row itself.

## Rules

- **The action re-checks the role in-action.** Middleware gates navigation, not action ids.
- **The list query must filter `deleted_at` explicitly.** Staff hold two permissive SELECT
  policies and permissive policies OR together, so the practical grant is every row. The
  active/archived split is an application filter; omitting it silently mixes archived patients
  back into the working roster.
- `deleted_by` is always set alongside `deleted_at`, and never cleared on restore without
  clearing both — a row with `deleted_by` set and `deleted_at` null is nonsense.
- The write is audited by the table's `audit_row()` trigger like any other UPDATE, so an
  archive shows in `private.audit_log` with before/after. Nothing extra to do.
- Lists default to active-only. Archived is a deliberate filter (`?archived=1`), never mixed
  into the default view.
- Do not cascade. Archiving a patient does not archive their appointments — history stays
  legible, and the appointment's own list filters on its own `deleted_at`.
