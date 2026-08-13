import { createClient } from "@/lib/supabase/server";
import type { FeedbackKind, FeedbackSeverity, FeedbackStatus } from "@/lib/feedback/schema";
import type { AppRole } from "@/lib/roles";

/**
 * Shared reads for the feedback screens.
 *
 * Named columns, never `select *` — and here that rule carries more than the
 * usual weight: `body` is free text, so a list query that pulled it would ship
 * every reporter's prose to a page that only renders titles.
 *
 * `.is("deleted_at", null)` is always explicit even though RLS filters too. The
 * superadmin holds two permissive SELECT policies (live and archived) and
 * permissive policies OR together, so the practical grant is every row: the
 * active/archived split is an APPLICATION filter, exactly as
 * 05-patterns/soft-delete.md says.
 */

export type FeedbackRow = {
  id: string;
  kind: FeedbackKind;
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  title: string;
  path: string | null;
  reporter_role: AppRole;
  created_at: string;
  deleted_at: string | null;
};

export type FeedbackDetail = FeedbackRow & {
  body: string;
  user_agent: string | null;
  viewport: string | null;
  triage_note: string | null;
  reporter_id: string;
  resolved_at: string | null;
  updated_at: string;
};

const LIST_COLUMNS =
  "id, kind, severity, status, title, path, reporter_role, created_at, deleted_at";

const DETAIL_COLUMNS = `${LIST_COLUMNS}, body, user_agent, viewport, triage_note, reporter_id, resolved_at, updated_at`;

/** The signed-in user's own reports, newest first. Drives "My reports". */
export async function getOwnReports(userId: string): Promise<FeedbackRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("feedback_reports")
    .select(LIST_COLUMNS)
    .eq("reporter_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as FeedbackRow[];
}

export async function getReport(id: string): Promise<FeedbackDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("feedback_reports")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as FeedbackDetail | null) ?? null;
}

/**
 * How many reports are waiting to be looked at.
 *
 * This is what 16-feedback.md rule 4 puts in place of an email: "the superadmin
 * sidebar carries a status='new' count badge; a pull notification cannot fail."
 * Filing must never depend on the send path, because the moment people file
 * bug reports is precisely the moment email is broken.
 *
 * `head: true` so this costs a count and no rows. Returns 0 on any failure —
 * a badge is not worth failing a layout render for.
 */
export async function getNewReportCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("feedback_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "new")
    .is("deleted_at", null);
  return error ? 0 : (count ?? 0);
}
