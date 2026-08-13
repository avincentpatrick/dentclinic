"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor, getStaffActor } from "@/lib/auth/actor";
import { duplicateAck } from "@/lib/forms/ack";
import { safeReturn } from "@/lib/forms/return-to";
import { echo, parseForm } from "@/lib/forms/validation";
import { PATIENT_FIELDS, patientSchema, type PatientField } from "@/lib/patients/schema";
import type { ActionState, Confirmable, DuplicateMatch } from "@/lib/forms/action-state";

/**
 * Staff-side patient writes.
 *
 * EVERY export re-checks the role in-action. Middleware gates NAVIGATION; a
 * Server Action is a POST of an action id to whatever path the browser is
 * already on, so a patient sitting on /home can invoke any action id it can
 * learn. "Only imported by a staff page" is not a check (AGENTS.md).
 *
 * RLS enforces the same rule underneath — these checks exist to turn a silent
 * empty result into a sentence a person can read.
 */

const PERMISSION_DENIED = "You don't have permission to change patient records.";
const CHECK_FAILED = "Couldn't check for existing records, so nothing was saved. Try again.";

/** The probe inputs, pulled from the parsed values in one place. */
type ProbeInput = { email: string | null; dob: string | null; lastName: string; phone: string | null };

function toMatch(row: {
  id: string;
  patient_number: string;
  full_name: string;
  match_reason: string;
  confidence: string;
}): DuplicateMatch {
  return {
    id: row.id,
    patientNumber: row.patient_number,
    fullName: row.full_name,
    reason: row.match_reason,
    confidence:
      row.confidence === "certain" || row.confidence === "likely" ? row.confidence : "possible",
  };
}

function confirmState(
  matches: DuplicateMatch[],
  ack: string,
  values: Record<string, string>,
): ActionState<PatientField> {
  const confirm: Confirmable = {
    kind: "duplicate-patient",
    title:
      matches.length === 1
        ? "This may already be a patient"
        : `${matches.length} existing records look similar`,
    detail:
      "Open the existing record if this is the same person. Create a separate record only if you are sure it is someone else.",
    existingHref: `/patients/${matches[0].id}`,
    proceedLabel: "Create a separate record",
    matches,
    ack,
  };
  return { status: "confirm", confirm, fieldErrors: {}, values };
}

export async function createPatient(
  _prev: ActionState<PatientField>,
  formData: FormData,
): Promise<ActionState<PatientField>> {
  // Echo FIRST, so every failure path below returns the user's typing intact.
  const values = echo(formData, PATIENT_FIELDS);

  const actor = await getStaffActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, patientSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const probe: ProbeInput = {
    email: v.email,
    dob: v.dob,
    lastName: v.last_name,
    phone: v.phone,
  };
  const ack = await duplicateAck({ ...probe, excludeId: null });

  // The ack rides on the proceed BUTTON's name/value, so the primary submit
  // never carries one and therefore always re-runs the check. A mismatch means
  // either "first submit" or "the values changed since the warning" — both need
  // the probe.
  if (formData.get("ack") !== ack) {
    const { data: matches, error } = await actor.supabase.rpc("find_patient_duplicates", {
      p_email: v.email ?? undefined,
      p_dob: v.dob ?? undefined,
      p_last_name: v.last_name,
      p_phone: v.phone ?? undefined,
    });

    // FAIL CLOSED. The warning is a safety feature; writing a record because the
    // check could not run is the one outcome that must never happen silently.
    if (error) return { status: "error", formError: CHECK_FAILED, values };
    if (matches?.length) return confirmState(matches.map(toMatch), ack, values);
  }

  const { data, error } = await actor.supabase
    .from("patients")
    .insert({
      first_name: v.first_name,
      middle_name: v.middle_name,
      last_name: v.last_name,
      email: v.email,
      dob: v.dob,
      phone: v.phone,
      sex: v.sex,
      address: v.address,
      emergency_contact_name: v.emergency_contact_name,
      emergency_contact_phone: v.emergency_contact_phone,
      marketing_opt_in: v.marketing_opt_in,
      marketing_opt_in_at: v.marketing_opt_in ? new Date().toISOString() : null,
      // consent_* stay null/null: patients_consent_versioned is both-or-neither,
      // and a walk-in has given no consent yet. The claim path fills it in when
      // that person registers and agrees for themselves.
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", formError: "Couldn't save the record. Try again.", values };
  }

  revalidatePath("/patients");
  // redirect() signals by THROWING — it must never sit inside a try block, and
  // nothing may follow it. forms.md: redirect on success for creates.
  redirect(`/patients/${data.id}?created=1`);
}

export async function updatePatient(
  id: string,
  _prev: ActionState<PatientField>,
  formData: FormData,
): Promise<ActionState<PatientField>> {
  const values = echo(formData, PATIENT_FIELDS);

  const actor = await getStaffActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, patientSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { data: existing } = await actor.supabase
    .from("patients")
    .select("id, deleted_at, marketing_opt_in, marketing_opt_in_at")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { status: "error", formError: "That record no longer exists.", values };
  if (existing.deleted_at) {
    return {
      status: "error",
      formError: "This record is archived. Restore it before editing.",
      values,
    };
  }

  // p_exclude / excludeId: a record must never warn about itself, and an ack
  // minted on an edit cannot be replayed on a create because the id is hashed.
  const ack = await duplicateAck({
    email: v.email,
    dob: v.dob,
    lastName: v.last_name,
    phone: v.phone,
    excludeId: id,
  });

  if (formData.get("ack") !== ack) {
    const { data: matches, error } = await actor.supabase.rpc("find_patient_duplicates", {
      p_email: v.email ?? undefined,
      p_dob: v.dob ?? undefined,
      p_last_name: v.last_name,
      p_phone: v.phone ?? undefined,
      p_exclude: id,
    });
    if (error) return { status: "error", formError: CHECK_FAILED, values };
    if (matches?.length) return confirmState(matches.map(toMatch), ack, values);
  }

  const { error } = await actor.supabase
    .from("patients")
    .update({
      first_name: v.first_name,
      middle_name: v.middle_name,
      last_name: v.last_name,
      email: v.email,
      dob: v.dob,
      phone: v.phone,
      sex: v.sex,
      address: v.address,
      emergency_contact_name: v.emergency_contact_name,
      emergency_contact_phone: v.emergency_contact_phone,
      marketing_opt_in: v.marketing_opt_in,
      // Same false->true rule update_own_patient uses: stamp when consent to
      // marketing is newly given, preserve the original date otherwise, clear
      // it on opt-out.
      marketing_opt_in_at: v.marketing_opt_in
        ? (existing.marketing_opt_in ? existing.marketing_opt_in_at : new Date().toISOString())
        : null,
    })
    .eq("id", id);

  if (error) return { status: "error", formError: "Couldn't save the changes. Try again.", values };

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  // Stay put for edits (forms.md) — the record is already on screen, so a
  // redirect would just make the user find their place again.
  //
  // `values` because React resets the form to its defaultValue attributes when
  // the action completes: a bare success would blank the fields the edit just
  // saved. Creates omit it, because they redirect.
  return { status: "success", message: "Changes saved.", values };
}

/** Scoped to /patients — see src/lib/forms/return-to.ts for why it exists. */
const returnToRoster = (returnTo: string, extra: Record<string, string> = {}) =>
  safeReturn(returnTo, "/patients", extra);

export async function archivePatient(id: string, returnTo: string): Promise<void> {
  // Nothing to render a message into — SoftDeleteMenu's props return void — so
  // this throws rather than returning quietly. RLS is the real gate; a throw
  // makes a bug loud instead of looking like a no-op.
  const actor = await getStaffActor();
  if (!actor) throw new Error("forbidden");

  const { error } = await actor.supabase
    .from("patients")
    .update({ deleted_at: new Date().toISOString(), deleted_by: actor.userId })
    .eq("id", id)
    .is("deleted_at", null); // idempotent: never re-stamp an already-archived row

  if (error) throw new Error("archive failed");

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  redirect(returnToRoster(returnTo, { undo: id }));
}

export async function restorePatient(id: string, returnTo: string): Promise<void> {
  const actor = await getStaffActor();
  if (!actor) throw new Error("forbidden");

  // Both cleared together: a row with deleted_by set and deleted_at null is
  // nonsense (soft-delete.md).
  const { error } = await actor.supabase
    .from("patients")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id)
    .not("deleted_at", "is", null);

  if (error) throw new Error("restore failed");

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  // No toast on restore: the row visibly rejoins the active roster (or leaves
  // the Archived filter), and forms.md only sanctions a toast when the result
  // is NOT visible on the current view.
  redirect(returnToRoster(returnTo));
}

/**
 * Exposed for the roster's Undo affordance, which is a client onClick inside a
 * toast rather than a form. Same checks; it simply cannot pass a returnTo.
 */
export async function restorePatientById(id: string): Promise<void> {
  await restorePatient(id, "/patients");
}

/** Used by the patient-facing surfaces to decide whether to offer /register. */
export async function hasPatientRecord(): Promise<boolean> {
  const actor = await getActor();
  if (!actor) return false;
  const { data } = await actor.supabase
    .from("patients")
    .select("id")
    .eq("profile_id", actor.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}
