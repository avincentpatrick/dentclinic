# Module: Billing & Invoicing

> Status: STUB — fill before this module's first increment. Source of truth for scope: `docs/PLAN.md`.

## Purpose
_To be filled._

## Data Owned (tables + key columns)
_To be filled — use canonical names from `docs/PLAN.md` § Data model._

## Screens (routes)
_To be filled._

## Rules & Invariants

_To be filled — except for one constraint inherited from Phase 2.2b, recorded now because it is
a decision this module has to honour or deliberately overturn._

### The `fee` lookup graduates to its own table when this module needs it

Phase 2.2b put the clinic's price list in `lookup_values` under a `fee` category, with a
first-class `amount numeric(12,2)` and a stable `code`. That shape is **knowingly incomplete**: a
real fee schedule needs **effective dates** (a price change must not retroactively re-describe
last month), a **code system** to join against `procedures.code`, and often **per-tooth or
per-surface variation**. `lookup_values` has one amount and no history.

It survives Phase 2 for one specific reason worth not re-deriving: **`invoice_items.unit_fee` is
a copied value** (PLAN.md:62), so re-pricing never rewrites an invoice that has already been
issued. The generic shape is safe *because* billing already denormalises — the same argument
that lets Phase 3 copy appointment durations onto each booking.

So, when this module needs any of the three things above: **create a `fee_schedule` table and
retire the `fee` category.** Do not widen `lookup_values` to meet it — that would put effective
dates and per-surface pricing on a table that also holds cancellation reasons.

Two things that must stay true regardless:

- **Money is never text and never a float.** `numeric(12,2)` in the database, parsed through
  `money()` in `src/lib/forms/validation.ts`, formatted through `Intl.NumberFormat`. A price
  re-parsed by whoever reads it is a billing defect, not a shortcut.
- **The currency is a `private.settings` key** (`currency`, seeded in 0013, read through
  `clinic_branding` since 0014), not a column. One clinic per install: an amount with no currency
  is not money, but a per-row currency would imply the clinic bills in several.

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| _tbd_ | | | | |

## Open Questions
- _none yet_