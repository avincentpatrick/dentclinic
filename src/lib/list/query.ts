/**
 * List state shared by every server-driven roster: parsed from searchParams,
 * never trusted raw.
 *
 * Pure functions with no Supabase import, because the rules that matter here are
 * checkable by reading one file: a sort key is never interpolated from user
 * input, and a search term is never concatenated into a PostgREST filter without
 * being made safe first.
 *
 * Extracted from `src/lib/patients/query.ts` in Phase 2.2b, when three lookups
 * lists needed the same parsers. `parseQuery` in particular ends its own comment
 * with "right until someone adds a fourth" — copying it into a second file is
 * exactly the failure it warns about, so it moved rather than being duplicated.
 * `patients/query.ts` re-exports everything here, so no existing call site
 * changed.
 */

export const PAGE_SIZE = 25;

export type SortDir = "asc" | "desc";

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
 * Resolve `?sort=` against a caller-supplied allow-list.
 *
 * `.order()` takes a column name that goes into the query string, so the value
 * must map through a table of known keys and never reach PostgREST as typed.
 * Generic over the key union so each list keeps its own typed `SortKey` — the
 * keys double as `Column.id` in the DataTable, which is what makes the header
 * links and the sort table agree by construction.
 */
export function parseSortKey<K extends string>(
  raw: unknown,
  sorts: Readonly<Record<K, string>>,
  fallback: K,
): K {
  return typeof raw === "string" && Object.hasOwn(sorts, raw) ? (raw as K) : fallback;
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
 * the discarded characters is something a person searches a list for.
 *
 * Without this, `Santos, Maria` or `O'Brien (Jr)` produces a filter string
 * PostgREST cannot parse: not an injection, but a 500 in front of a waiting
 * patient, triggered by ordinary punctuation in an ordinary name. A bare `%`
 * would be worse — it matches everything.
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
 * Build a `?a=b&c=d` string from a params bag, dropping empty values.
 *
 * Shared so that "a link carries the whole list state" is implemented once.
 * Anything absent from the bag is dropped by DataTable's own href builder on
 * pagination, which is the trap every list page has to get right.
 */
export function toSearch(
  params: Record<string, string | undefined>,
  page?: number,
): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  if (page && page > 1) search.set("page", String(page));
  return search.toString();
}
