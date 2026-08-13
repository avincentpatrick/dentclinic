import {
  PAGE_SIZE,
  parseArchived,
  parseDir,
  parsePage,
  parseQuery,
  parseSortKey,
  toSearch,
  type SortDir,
} from "@/lib/list/query";

/**
 * List state for the three /admin/lookups screens.
 *
 * Pure and Supabase-free, mirroring `src/lib/patients/query.ts`: the sort
 * allow-lists and the link builders live here so the rule "a sort key is never
 * interpolated from user input" is checkable by reading one file.
 */

export { PAGE_SIZE, parseArchived, parseDir, parsePage, parseQuery, type SortDir };

/**
 * `sort_order` is the default everywhere, because that is what the column is
 * for: a clinic-chosen order that the Phase 3 calendar and the Phase 4 booking
 * wizard both read. Alphabetical would be an arbitrary second opinion.
 */
export const APPOINTMENT_TYPE_SORTS = {
  sort_order: "sort_order",
  name: "name",
  duration_units: "duration_units",
  updated_at: "updated_at",
} as const;

export const OPERATORY_SORTS = {
  sort_order: "sort_order",
  name: "name",
  updated_at: "updated_at",
} as const;

export const LOOKUP_VALUE_SORTS = {
  sort_order: "sort_order",
  label: "label",
  code: "code",
  amount: "amount",
  updated_at: "updated_at",
} as const;

export type AppointmentTypeSort = keyof typeof APPOINTMENT_TYPE_SORTS;
export type OperatorySort = keyof typeof OPERATORY_SORTS;
export type LookupValueSort = keyof typeof LOOKUP_VALUE_SORTS;

export const DEFAULT_SORT = "sort_order";

export const parseAppointmentTypeSort = (raw: unknown): AppointmentTypeSort =>
  parseSortKey(raw, APPOINTMENT_TYPE_SORTS, DEFAULT_SORT);
export const parseOperatorySort = (raw: unknown): OperatorySort =>
  parseSortKey(raw, OPERATORY_SORTS, DEFAULT_SORT);
export const parseLookupValueSort = (raw: unknown): LookupValueSort =>
  parseSortKey(raw, LOOKUP_VALUE_SORTS, DEFAULT_SORT);

/**
 * `cancel_reason` <-> `cancel-reason`.
 *
 * A pure pair rather than a `slug` column: the key's CHECK constraint already
 * restricts it to `[a-z][a-z0-9_]*`, so the mapping is total and reversible, and
 * a stored slug would be a second thing to keep in step with the key.
 */
export const keyToSlug = (key: string): string => key.replace(/_/g, "-");
export const slugToKey = (slug: string): string => slug.replace(/-/g, "_");

/**
 * Slugs that belong to the static lookups routes. `/admin/lookups/[category]`
 * would otherwise shadow them if a category were ever seeded with a matching
 * key — Next resolves static segments first, but relying on that leaves the
 * dynamic route rendering something confusing rather than a 404.
 */
export const RESERVED_LOOKUP_SLUGS = ["appointment-types", "operatories"] as const;

export type ListState = {
  q: string;
  sort: string;
  dir: SortDir;
  archived: boolean;
};

/**
 * The params every lookups link must carry so search, sort and the Archived
 * filter survive a page turn.
 *
 * **All four must be here.** DataTable's pagination patches only `page`, so
 * anything missing from this bag is silently dropped the moment someone presses
 * Next — which is the single most likely regression on these screens.
 */
export function lookupsParams(state: ListState): Record<string, string | undefined> {
  return {
    q: state.q || undefined,
    sort: state.sort === DEFAULT_SORT ? undefined : state.sort,
    dir: state.dir === "asc" ? undefined : state.dir,
    archived: state.archived ? "1" : undefined,
  };
}

/** `<base>?…` for a given list state — used for links and for returnTo. */
export function lookupsHref(base: string, state: ListState & { page?: number }): string {
  const qs = toSearch(lookupsParams(state), state.page);
  return qs ? `${base}?${qs}` : base;
}

/**
 * Single-column search. `parseQuery` has already removed `%`, `_`, `*`, `,`,
 * `(` and `)`, so the term is safe to interpolate into a PostgREST filter.
 */
export function nameLike(q: string): string | null {
  return q ? `*${q}*` : null;
}
