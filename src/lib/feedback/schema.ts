import type { Database } from "@/lib/supabase/database.types";
import { oneOf, optional, required, type Schema } from "@/lib/forms/validation";

/**
 * Field lists, vocabularies and validators for the feedback module.
 *
 * Separate from `src/app/actions/feedback.ts` because a `"use server"` module
 * may export only async functions — the same split `src/lib/lookups/schema.ts`
 * makes for the same reason.
 */

export type FeedbackKind = Database["public"]["Enums"]["feedback_kind"];
export type FeedbackSeverity = Database["public"]["Enums"]["feedback_severity"];
export type FeedbackStatus = Database["public"]["Enums"]["feedback_status"];

/**
 * `satisfies` rather than a bare annotation, so these stay tied to the DB.
 *
 * Removing a label from the enum in a future migration then makes this a TYPE
 * ERROR instead of a picker offering a value the database will reject. The
 * `as const` keeps the tuple ordered, because the order IS the display order.
 */
export const FEEDBACK_KINDS = [
  "bug",
  "idea",
  "question",
  "data_issue",
] as const satisfies readonly FeedbackKind[];

export const FEEDBACK_SEVERITIES = [
  "blocker",
  "major",
  "minor",
  "cosmetic",
] as const satisfies readonly FeedbackSeverity[];

export const FEEDBACK_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "resolved",
  "wont_fix",
  "duplicate",
] as const satisfies readonly FeedbackStatus[];

/** Words a person reads. The enum values are never shown. */
export const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "Something is broken",
  idea: "An idea or suggestion",
  question: "A question",
  data_issue: "Information looks wrong",
};

export const SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  blocker: "Blocking my work",
  major: "Major",
  minor: "Minor",
  cosmetic: "Cosmetic",
};

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
};

export const KIND_OPTIONS = FEEDBACK_KINDS.map((v) => ({ value: v, label: KIND_LABELS[v] }));
export const SEVERITY_OPTIONS = FEEDBACK_SEVERITIES.map((v) => ({
  value: v,
  label: SEVERITY_LABELS[v],
}));
export const STATUS_OPTIONS = FEEDBACK_STATUSES.map((v) => ({
  value: v,
  label: STATUS_LABELS[v],
}));

// ---------------------------------------------------------------------------
// Filing
// ---------------------------------------------------------------------------

/**
 * `from` and `viewport` are in the field list because they are submitted, but
 * they are NOT things the user typed — see `feedbackSchema` for what happens to
 * `from`, which is the whole of rule 1 on the server side.
 */
export const FEEDBACK_FIELDS = ["kind", "severity", "title", "body", "from", "viewport"] as const;
export type FeedbackField = (typeof FEEDBACK_FIELDS)[number];

export type FeedbackInput = {
  kind: FeedbackKind;
  severity: FeedbackSeverity;
  title: string;
  body: string;
  /** Raw, untrusted. The action runs `maskPath` over it and stores the pattern. */
  from: string | null;
  viewport: string | null;
};

/**
 * Bounds MIRROR the CHECK constraints in migration 0015 exactly.
 *
 * forms.md is explicit about why: when the two drift, the database rejects
 * something the form accepted and the resulting error has no field to attach
 * itself to, so the user sees a red banner and no indication of what to change.
 */
export const TITLE_MAX = 120;
export const BODY_MAX = 4000;

/** Shape-checked, not trusted: a viewport is `WIDTHxHEIGHT` or it is nothing. */
const viewport: Schema<FeedbackInput>["viewport"] = (raw) => {
  const v = (raw ?? "").trim();
  if (!v) return { ok: true, value: null };
  return /^\d{1,5}x\d{1,5}$/.test(v)
    ? { ok: true, value: v }
    : // Never a field error: the user did not type this and cannot fix it.
      // Dropping it silently is right — a report that fails to file because the
      // browser reported an odd viewport would be absurd.
      { ok: true, value: null };
};

export const feedbackSchema: Schema<FeedbackInput> = {
  kind: oneOf(FEEDBACK_KINDS, "kind"),
  severity: oneOf(FEEDBACK_SEVERITIES, "severity"),
  title: required("A short summary", TITLE_MAX),
  body: required("What happened", BODY_MAX),
  // Deliberately `optional` with a generous cap and NO path validation here.
  // Validating it would imply the value is used as given; it is not. The action
  // passes it through `maskPath`, which returns a member of ROUTE_PATTERNS or
  // null, so nothing the caller writes here can reach the column.
  from: optional(512),
  viewport,
};

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

export const TRIAGE_FIELDS = ["status", "severity", "triage_note"] as const;
export type TriageField = (typeof TRIAGE_FIELDS)[number];

export type TriageInput = {
  status: FeedbackStatus;
  severity: FeedbackSeverity;
  triage_note: string | null;
};

export const TRIAGE_NOTE_MAX = 1000;

export const triageSchema: Schema<TriageInput> = {
  status: oneOf(FEEDBACK_STATUSES, "status"),
  severity: oneOf(FEEDBACK_SEVERITIES, "severity"),
  triage_note: optional(TRIAGE_NOTE_MAX),
};
