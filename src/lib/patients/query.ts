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
 * Roster list state for /patients.
 *
 * The generic parsers moved to `src/lib/list/query.ts` in Phase 2.2b, when the
 * lookups screens needed the same ones — `parseQuery`'s allow-list is a security
 * control whose own comment ends "right until someone adds a fourth", so a
 * second copy was not an option. They are RE-EXPORTED here so every existing
 * call site in `/patients` keeps working unchanged.
 *
 * What stays patients-specific: the sortable-column allow-list, the PostgREST
 * search expression across four columns, and the link builders.
 */

export {
  PAGE_SIZE,
  parseArchived,
  parseDir,
  parsePage,
  parseQuery,
  type SortDir,
};

/**
 * Sortable columns, as an allow-list. `.order()` takes a column name that goes
 * into the query string, so `?sort=` must map through this and never reach
 * PostgREST as typed. The keys double as `Column.id` in the DataTable, which is
 * what makes the header links and this table agree by construction.
 */
export const SORTS = {
  full_name: "full_name",
  patient_number: "patient_number",
  dob: "dob",
  updated_at: "updated_at",
} as const;

export type SortKey = keyof typeof SORTS;

export const DEFAULT_SORT: SortKey = "full_name";

export function parseSort(raw: unknown): SortKey {
  return parseSortKey(raw, SORTS, DEFAULT_SORT);
}

/**
 * Build the PostgREST `or=` expression for the roster search.
 *
 * `*` is PostgREST's wildcard alias for `%` in like/ilike; using it avoids any
 * question about how a literal `%` survives URL encoding. The term itself can
 * no longer contain either — see parseQuery.
 *
 * Returns null when nothing searchable is left, so the caller skips `.or()`
 * entirely rather than sending an empty disjunction.
 */
export function searchFilter(q: string): string | null {
  if (!q) return null;

  const like = `*${q}*`;
  const clauses = [
    `full_name.ilike.${like}`,
    `patient_number.ilike.${like}`,
    `email.ilike.${like}`,
  ];

  // phone_norm holds the LAST 10 DIGITS ONLY, so it can never match a term with
  // punctuation in it. "0917 123 4567" pasted from a chat has to be reduced the
  // same way the generated column was, or the one search staff use most often
  // silently returns nothing.
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3) clauses.push(`phone_norm.ilike.*${digits}*`);

  return clauses.join(",");
}

/**
 * The params every roster link must carry so search, sort and the Archived
 * filter survive a page turn. Empty values are dropped by DataTable's own
 * href builder, so `undefined` here means "leave it out of the URL".
 */
export function rosterParams(state: {
  q: string;
  sort: SortKey;
  dir: SortDir;
  archived: boolean;
}): Record<string, string | undefined> {
  return {
    q: state.q || undefined,
    sort: state.sort === DEFAULT_SORT ? undefined : state.sort,
    dir: state.dir === "asc" ? undefined : state.dir,
    archived: state.archived ? "1" : undefined,
  };
}

/** `/patients?…` for a given list state — used for links and for returnTo. */
export function rosterHref(state: {
  q: string;
  sort: SortKey;
  dir: SortDir;
  archived: boolean;
  page?: number;
}): string {
  const qs = toSearch(rosterParams(state), state.page);
  return qs ? `/patients?${qs}` : "/patients";
}
