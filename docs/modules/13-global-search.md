# Module: Global Search

> Status: STUB for the full module (Phase 8.2). **Phase 1.2 shipped the shell and one provider** — that scope is recorded below; everything else is still to be filled.

## Phase 1.2 scope (shipped)

- `CommandK` — ⌘K / Ctrl+K, or `/` outside a text field. Lazy-loaded via `next/dynamic({ ssr: false })` so cmdk stays out of the initial chunk and the Worker render path.
- **Navigate section only.** One `SearchProvider` ([src/lib/search/providers.ts](../../src/lib/search/providers.ts)) returning the current role's nav links. No network, no PHI.
- The Phase 8 seam is fixed now: `SECTION_ORDER` (Recent → Actions → Patients → Appointments → Navigate → Records → Help), the `SearchProvider` interface, and a 200ms debounce. The palette renders `SECTION_ORDER` and skips empty groups, so 8.2 appends to an array rather than refactoring rendering.
- **Not built:** `SearchSheet`, server recents, zero-result logging, contextual patient mode, `/api/search`.

**Binding rule for Phase 8:** the authoritative role scope is the **server** search API. Phase 1's scoping is client-side and cosmetic because it only filters nav links the user can already see. Never add a data-bearing provider that filters client-side — staff must not *receive* clinical-note rows at all, not merely have them hidden. That is 8.2's acceptance criterion.

## Purpose
_To be filled (Phase 8.2)._

## Data Owned (tables + key columns)
_To be filled — use canonical names from `docs/PLAN.md` § Data model._

## Screens (routes)
_To be filled._

## Rules & Invariants
_To be filled._

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| _tbd_ | | | | |

## Open Questions
- _none yet_