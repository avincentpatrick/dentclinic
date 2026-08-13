/**
 * Roster list state: parsed from searchParams, never trusted raw.
 *
 * Pure functions with no Supabase import, because the two rules that matter
 * here are checkable by reading one file: a sort key is never interpolated from
 * user input, and a search term is never concatenated into a PostgREST filter
 * without being made safe first.
 */

export const PAGE_SIZE = 25;

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
export type SortDir = "asc" | "desc";

export const DEFAULT_SORT: SortKey = "full_name";

export function parseSort(raw: unknown): SortKey {
  return typeof raw === "string" && raw in SORTS ? (raw as SortKey) : DEFAULT_SORT;
}

export function parseDir(raw: unknown): SortDir {
  return raw === "desc" ? "desc" : "asc";
}

/** 1-based in the URL (page=1 is the first page); clamped so `?page=-4` is page 1. */
export function parsePage(raw: unknown): number {
  const n = Number.parseInt(typeof raw === "string" ? raw : "", 10);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

export function parseArchived(raw: unknown): boolean {
  return raw === "1";
}

/**
 * Trim and cap what the user typed, and reduce it to characters that are safe
 * in every layer it passes through. Empty string means "no filter".
 *
 * This is an ALLOW-LIST, not an escape chain, and that is deliberate. A roster
 * search crosses three grammars at once:
 *
 *   - PostgREST's `or=` argument is comma-separated and paren-delimited, so
 *     `,` `(` `)` `"` and backslash break the FILTER STRING;
 *   - `%` and `_` are SQL LIKE metacharacters, and PostgREST additionally
 *     rewrites `*` to `%`, so all three are WILDCARDS if they survive;
 *   - the whole thing is then URL-encoded.
 *
 * Escaping correctly for three layers at once is the kind of thing that is
 * right until someone adds a fourth. Keeping letters, numbers, spaces and the
 * four punctuation marks that actually occur in names and contact details
 * (`. ' - @`) makes every one of those hazards unrepresentable — and none of
 * the discarded characters is something a person searches a patient roster for.
 *
 * Without this, `Santos, Maria` or `O'Brien (Jr)` produces a filter string
 * PostgREST cannot parse: not an injection, but a 500 in front of a waiting
 * patient, triggered by ordinary punctuation in an ordinary name. A bare `%`
 * would be worse — it matches the entire roster.
 *
 * `\p{L}` is Unicode-aware, so Ñ and é survive; NFKC first so composed and
 * decomposed forms of the same name compare equal.
 */
export function parseQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}@.'\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
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
  const params = rosterParams(state);
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  if (state.page && state.page > 1) search.set("page", String(state.page));
  const qs = search.toString();
  return qs ? `/patients?${qs}` : "/patients";
}
