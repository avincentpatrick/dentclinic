"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor, getSuperadminActor } from "@/lib/auth/actor";
import { maskPath } from "@/lib/feedback/path";
import {
  FEEDBACK_FIELDS,
  TRIAGE_FIELDS,
  feedbackSchema,
  triageSchema,
  type FeedbackField,
  type TriageField,
} from "@/lib/feedback/schema";
import { safeReturn } from "@/lib/forms/return-to";
import { echo, parseForm } from "@/lib/forms/validation";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * EVERY export re-checks the role in-action. Middleware gates NAVIGATION; a
 * Server Action is a POST of an action id to whatever path the browser is
 * already on, so a staff user sitting on /today can invoke any action id it can
 * learn and middleware never sees an /admin request (AGENTS.md). RLS is the
 * real boundary underneath — these checks exist to turn a policy's empty result
 * set into a sentence a person can read.
 *
 * NOTHING IN THIS FILE SENDS EMAIL, AND NOTHING MAY EVER BE ADDED THAT DOES.
 * 16-feedback.md rule 4: "Filing never sends email, and must never be able to."
 * People file bug reports at exactly the moment things are broken, and email
 * being broken is one of the things they file about. The superadmin gets a
 * status='new' count badge instead — a pull notification cannot fail. When the
 * Phase 5 send pipeline exists, a `blocker` may enqueue an alert, but as a
 * separate statement outside this insert's transaction with its errors
 * swallowed.
 */

const FILE_PERMISSION_DENIED = "You need to be signed in to send a report.";
const TRIAGE_PERMISSION_DENIED = "You don't have permission to triage reports.";
const ADMIN_BASE = "/admin/feedback";

/** A user agent is diagnostic, not evidence. Bounded to the column's CHECK. */
async function currentUserAgent(): Promise<string | null> {
  try {
    const ua = (await headers()).get("user-agent");
    return ua ? ua.slice(0, 400) : null;
  } catch {
    return null;
  }
}

export async function fileReport(
  _prev: ActionState<FeedbackField>,
  formData: FormData,
): Promise<ActionState<FeedbackField>> {
  // Echo FIRST, so every failure path below returns the user's typing intact.
  const values = echo(formData, FEEDBACK_FIELDS);

  const actor = await getActor();
  if (!actor) return { status: "error", formError: FILE_PERMISSION_DENIED, values };

  const parsed = parseForm(formData, feedbackSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { error } = await actor.supabase.from("feedback_reports").insert({
    kind: v.kind,
    severity: v.severity,
    title: v.title,
    body: v.body,
    // RULE 1. `v.from` is untrusted input -- the nav link builds it from
    // usePathname(), and anyone can type whatever they like into the query
    // string. maskPath returns a member of ROUTE_PATTERNS or null, so what
    // lands in the column is a pattern the app itself declares, never text the
    // caller supplied. The CHECK constraint in 0015 says the same thing again
    // one layer down, for the PostgREST-direct case this action cannot see.
    path: maskPath(v.from),
    viewport: v.viewport,
    user_agent: await currentUserAgent(),

    // SENT, BUT NOT TRUSTED -- and the distinction is the point.
    //
    // Both columns are NOT NULL with no default, so the generated Insert type
    // requires them. What actually decides their values is
    // `feedback_reports_guard`, which OVERWRITES both from auth.uid() and
    // jwt_role() on every insert. So these two lines are the honest statement
    // of who this action believes is filing, and the database independently
    // agrees or wins.
    //
    // That is why filing as somebody else is impossible rather than merely
    // unimplemented: a hand-crafted PostgREST insert naming another user's id
    // is silently corrected, not rejected-if-we-remember-to-check. Proven in
    // supabase/verify/0015-feedback.sql, checks C1 and C2.
    reporter_id: actor.userId,
    reporter_role: actor.role,
    // `status` is deliberately absent: the guard forces 'new', so a report
    // cannot be filed pre-triaged.
  });

  if (error) {
    return { status: "error", formError: "Couldn't send the report. Try again.", values };
  }

  revalidatePath("/feedback");
  revalidatePath(ADMIN_BASE);
  // redirect() signals by THROWING -- it must never sit inside a try block, and
  // nothing may follow it. Values are omitted on a redirect: there is no form
  // left to re-render.
  redirect("/feedback?filed=1");
}

export async function triageReport(
  id: string,
  _prev: ActionState<TriageField>,
  formData: FormData,
): Promise<ActionState<TriageField>> {
  const values = echo(formData, TRIAGE_FIELDS);

  const actor = await getSuperadminActor();
  if (!actor) return { status: "error", formError: TRIAGE_PERMISSION_DENIED, values };

  const parsed = parseForm(formData, triageSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  // Only the three triage columns. Sending the whole row back would hit the
  // guard's report_immutable rule the moment any of it round-tripped through
  // the form differently -- and would be asking the database to protect us from
  // our own update statement.
  const { error } = await actor.supabase
    .from("feedback_reports")
    .update({ status: v.status, severity: v.severity, triage_note: v.triage_note })
    .eq("id", id);

  if (error) {
    return { status: "error", formError: "Couldn't save the triage. Try again.", values };
  }

  revalidatePath(ADMIN_BASE);
  revalidatePath(`${ADMIN_BASE}/${id}`);
  // Stays on the page, so `values` is REQUIRED: React resets an uncontrolled
  // form to its defaultValue attributes when the action completes, and a
  // success carrying no values would silently blank the form.
  return { status: "success", message: "Triage saved.", values };
}

/**
 * Void actions -- SoftDeleteMenu's props return void, so there is nothing to
 * render a message into and these THROW instead. RLS is the real gate; a throw
 * makes a bug loud rather than looking like a no-op.
 */
export async function archiveReport(id: string, returnTo: string): Promise<void> {
  const actor = await getSuperadminActor();
  if (!actor) throw new Error("forbidden");

  const { error } = await actor.supabase
    .from("feedback_reports")
    .update({ deleted_at: new Date().toISOString(), deleted_by: actor.userId })
    .eq("id", id)
    .is("deleted_at", null); // idempotent: never re-stamp an already-archived row

  if (error) throw new Error("archive failed");

  revalidatePath(ADMIN_BASE);
  redirect(safeReturn(returnTo, ADMIN_BASE, { undo: id }));
}

export async function restoreReport(id: string, returnTo: string): Promise<void> {
  const actor = await getSuperadminActor();
  if (!actor) throw new Error("forbidden");

  const { error } = await actor.supabase
    .from("feedback_reports")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id);

  if (error) throw new Error("restore failed");

  revalidatePath(ADMIN_BASE);
  redirect(safeReturn(returnTo, ADMIN_BASE));
}

/**
 * Restore by id alone, for the Undo action on the archived toast.
 *
 * Mirrors `restorePatientById`: the toast's onClick has no returnTo to hand
 * back, and re-deriving one client-side would be a redirect target built from
 * whatever the browser happened to be showing.
 */
export async function restoreReportById(id: string): Promise<void> {
  const actor = await getSuperadminActor();
  if (!actor) throw new Error("forbidden");

  const { error } = await actor.supabase
    .from("feedback_reports")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id);

  if (error) throw new Error("restore failed");
  revalidatePath(ADMIN_BASE);
}
