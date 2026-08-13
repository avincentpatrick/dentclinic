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
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback/schema";

/**
 * List state for /admin/feedback.
 *
 * Same shape as `src/lib/lookups/query.ts` and `src/lib/patients/query.ts`:
 * pure, Supabase-free, with the sort allow-list here so "a sort key is never
 * interpolated from user input" stays checkable by reading one file.
 */

export { PAGE_SIZE, parseArchived, parseDir, parsePage, parseQuery, type SortDir };

/**
 * Newest first by default, unlike the lookups screens.
 *
 * A lookups list has a clinic-chosen `sort_order` that means something; a
 * triage queue does not. What a superadmin opening this screen wants is what
 * came in since they last looked.
 */
export const FEEDBACK_SORTS = {
  created_at: "created_at",
  status: "status",
  severity: "severity",
  kind: "kind",
} as const;

export type FeedbackSort = keyof typeof FEEDBACK_SORTS;

export const DEFAULT_SORT: FeedbackSort = "created_at";
export const DEFAULT_DIR: SortDir = "desc";

export const parseFeedbackSort = (raw: unknown): FeedbackSort =>
  parseSortKey(raw, FEEDBACK_SORTS, DEFAULT_SORT);

/**
 * The status filter, as a URL value.
 *
 * `""` means "every status". Parsed through the enum tuple rather than trusted,
 * for the same reason `parseSortKey` exists — this reaches PostgREST as a
 * filter value.
 */
export function parseStatusFilter(raw: unknown): FeedbackStatus | "" {
  return typeof raw === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(raw)
    ? (raw as FeedbackStatus)
    : "";
}

export type FeedbackListState = {
  q: string;
  sort: FeedbackSort;
  dir: SortDir;
  archived: boolean;
  status: FeedbackStatus | "";
};

/**
 * The params every /admin/feedback link must carry.
 *
 * **All FIVE must be here** — this list has a status filter the lookups screens
 * do not. DataTable's pagination patches only `page`, so anything missing from
 * this bag is silently dropped the moment someone presses Next, which is the
 * regression `lookupsParams` warns about and the one most likely to recur here
 * because there is one more param to forget.
 */
export function feedbackParams(state: FeedbackListState): Record<string, string | undefined> {
  return {
    q: state.q || undefined,
    sort: state.sort === DEFAULT_SORT ? undefined : state.sort,
    dir: state.dir === DEFAULT_DIR ? undefined : state.dir,
    archived: state.archived ? "1" : undefined,
    status: state.status || undefined,
  };
}

export function feedbackHref(
  base: string,
  state: FeedbackListState & { page?: number },
): string {
  const qs = toSearch(feedbackParams(state), state.page);
  return qs ? `${base}?${qs}` : base;
}

/**
 * Search across the title only.
 *
 * NOT the body, deliberately. `parseQuery` has already reduced the term to
 * letters, numbers and four punctuation marks, so interpolation is safe — the
 * reason is different: the body is where patient details get pasted despite the
 * help text, and a superadmin who can grep it by substring has a search
 * interface over exactly the text rule 2 keeps out of the audit log. The title
 * is short, deliberate, and what a person remembers a report by.
 */
export function titleLike(q: string): string | null {
  return q ? `*${q}*` : null;
}
