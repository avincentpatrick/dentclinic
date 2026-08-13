"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSuperadminActor } from "@/lib/auth/actor";
import { safeReturn } from "@/lib/forms/return-to";
import { echo, parseForm } from "@/lib/forms/validation";
import {
  APPOINTMENT_TYPE_FIELDS,
  appointmentTypeSchema,
  LOOKUP_VALUE_FIELDS,
  lookupValueSchema,
  OPERATORY_FIELDS,
  operatorySchema,
  type AppointmentTypeField,
  type LookupValueField,
  type LookupValueKind,
  type OperatoryField,
} from "@/lib/lookups/schema";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Clinic lookups writes — appointment types, operatories, and the generic
 * lookup values.
 *
 * EVERY export re-checks the role in-action. Middleware gates NAVIGATION; a
 * Server Action is a POST of an action id to whatever path the browser is
 * already on (AGENTS.md), so being imported only by an /admin page is not a
 * check. RLS enforces the same rule underneath; these checks turn a silent empty
 * result into a sentence.
 */

const PERMISSION_DENIED = "You don't have permission to change clinic lookups.";
const BASE = "/admin/lookups";

/**
 * The three archivable tables, as a closed union. supabase-js types `.from()`
 * against the generated Database, so a table name that is not one of these is a
 * compile error rather than a runtime 404 — which is what makes one generic
 * archive/restore pair safe instead of a stringly-typed hole.
 */
type LookupTable = "appointment_types" | "operatories" | "lookup_values";

/** Constraint and trigger errors, turned into something a person can act on. */
function messageFor(error: { code?: string; message?: string }, label: string): string {
  const m = error.message ?? "";
  if (error.code === "23505") return `Another live entry already uses that ${label}.`;
  if (m.includes("system_not_archivable") || error.code === "23514") {
    if (m.includes("system_not_archivable")) {
      return "Built-in entries can be renamed but not archived — the app reads them by name.";
    }
    return "That value is outside the allowed range.";
  }
  if (m.includes("amount_required")) return "This category needs an amount.";
  if (m.includes("amount_not_allowed")) return "This category does not take an amount.";
  if (m.includes("system_code_immutable")) return "A built-in entry's code cannot be changed.";
  if (m.includes("category_immutable")) return "A value cannot be moved to another category.";
  return "Couldn't save the changes. Try again.";
}

// ----------------------------------------------------------- appointment types

export async function createAppointmentType(
  _prev: ActionState<AppointmentTypeField>,
  formData: FormData,
): Promise<ActionState<AppointmentTypeField>> {
  const values = echo(formData, APPOINTMENT_TYPE_FIELDS);

  const actor = await getSuperadminActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, appointmentTypeSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { error } = await actor.supabase.from("appointment_types").insert({
    name: v.name,
    description: v.description,
    duration_units: v.duration_minutes,
    pre_buffer_units: v.pre_buffer_minutes,
    post_buffer_units: v.post_buffer_minutes,
    patient_bookable: v.patient_bookable,
    color: v.color,
    sort_order: v.sort_order,
  });
  if (error) {
    return error.code === "23505"
      ? { status: "invalid", fieldErrors: { name: messageFor(error, "name") }, values }
      : { status: "error", formError: messageFor(error, "name"), values };
  }

  revalidatePath(BASE);
  revalidatePath(`${BASE}/appointment-types`);
  // redirect() signals by THROWING — it must never sit inside a try block.
  redirect(`${BASE}/appointment-types?saved=1`);
}

export async function updateAppointmentType(
  id: string,
  _prev: ActionState<AppointmentTypeField>,
  formData: FormData,
): Promise<ActionState<AppointmentTypeField>> {
  const values = echo(formData, APPOINTMENT_TYPE_FIELDS);

  const actor = await getSuperadminActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, appointmentTypeSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { error } = await actor.supabase
    .from("appointment_types")
    .update({
      name: v.name,
      description: v.description,
      duration_units: v.duration_minutes,
      pre_buffer_units: v.pre_buffer_minutes,
      post_buffer_units: v.post_buffer_minutes,
      patient_bookable: v.patient_bookable,
      color: v.color,
      sort_order: v.sort_order,
    })
    .eq("id", id);
  if (error) {
    return error.code === "23505"
      ? { status: "invalid", fieldErrors: { name: messageFor(error, "name") }, values }
      : { status: "error", formError: messageFor(error, "name"), values };
  }

  revalidatePath(BASE);
  revalidatePath(`${BASE}/appointment-types`);
  // Stays put, so `values` is required — React resets a form to its
  // defaultValue attributes when the action completes.
  return { status: "success", message: "Changes saved.", values };
}

// ----------------------------------------------------------------- operatories

export async function createOperatory(
  _prev: ActionState<OperatoryField>,
  formData: FormData,
): Promise<ActionState<OperatoryField>> {
  const values = echo(formData, OPERATORY_FIELDS);

  const actor = await getSuperadminActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, operatorySchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { error } = await actor.supabase.from("operatories").insert({
    name: v.name,
    sort_order: v.sort_order,
    is_hygiene: v.is_hygiene,
    default_provider_id: v.default_provider_id,
  });
  if (error) {
    return error.code === "23505"
      ? { status: "invalid", fieldErrors: { name: messageFor(error, "name") }, values }
      : { status: "error", formError: messageFor(error, "name"), values };
  }

  revalidatePath(BASE);
  revalidatePath(`${BASE}/operatories`);
  redirect(`${BASE}/operatories?saved=1`);
}

export async function updateOperatory(
  id: string,
  _prev: ActionState<OperatoryField>,
  formData: FormData,
): Promise<ActionState<OperatoryField>> {
  const values = echo(formData, OPERATORY_FIELDS);

  const actor = await getSuperadminActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, operatorySchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { error } = await actor.supabase
    .from("operatories")
    .update({
      name: v.name,
      sort_order: v.sort_order,
      is_hygiene: v.is_hygiene,
      default_provider_id: v.default_provider_id,
    })
    .eq("id", id);
  if (error) {
    return error.code === "23505"
      ? { status: "invalid", fieldErrors: { name: messageFor(error, "name") }, values }
      : { status: "error", formError: messageFor(error, "name"), values };
  }

  revalidatePath(BASE);
  revalidatePath(`${BASE}/operatories`);
  return { status: "success", message: "Changes saved.", values };
}

// --------------------------------------------------------------- lookup values

export async function createLookupValue(
  categoryId: string,
  slug: string,
  kind: LookupValueKind,
  _prev: ActionState<LookupValueField>,
  formData: FormData,
): Promise<ActionState<LookupValueField>> {
  const values = echo(formData, LOOKUP_VALUE_FIELDS);

  const actor = await getSuperadminActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, lookupValueSchema(kind));
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { error } = await actor.supabase.from("lookup_values").insert({
    category_id: categoryId,
    label: v.label,
    code: v.code,
    amount: v.amount,
    sort_order: v.sort_order,
  });
  if (error) {
    return error.code === "23505"
      ? { status: "invalid", fieldErrors: { label: messageFor(error, "label") }, values }
      : { status: "error", formError: messageFor(error, "label"), values };
  }

  revalidatePath(BASE);
  revalidatePath(`${BASE}/${slug}`);
  redirect(`${BASE}/${slug}?saved=1`);
}

export async function updateLookupValue(
  id: string,
  slug: string,
  kind: LookupValueKind,
  _prev: ActionState<LookupValueField>,
  formData: FormData,
): Promise<ActionState<LookupValueField>> {
  const values = echo(formData, LOOKUP_VALUE_FIELDS);

  const actor = await getSuperadminActor();
  if (!actor) return { status: "error", formError: PERMISSION_DENIED, values };

  const parsed = parseForm(formData, lookupValueSchema(kind));
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  // `code` is deliberately absent from the update payload. Changing a code
  // splits a year of report grouping across two rows, which is the exact reason
  // the column exists — so it is set once, at creation, and never edited.
  const { error } = await actor.supabase
    .from("lookup_values")
    .update({ label: v.label, amount: v.amount, sort_order: v.sort_order })
    .eq("id", id);
  if (error) {
    return error.code === "23505"
      ? { status: "invalid", fieldErrors: { label: messageFor(error, "label") }, values }
      : { status: "error", formError: messageFor(error, "label"), values };
  }

  revalidatePath(BASE);
  revalidatePath(`${BASE}/${slug}`);
  return { status: "success", message: "Changes saved.", values };
}

// ------------------------------------------------------------ archive/restore

/**
 * Void actions — SoftDeleteMenu's props return void, so there is nothing to
 * render a message into and these THROW instead. RLS is the real gate; a throw
 * makes a bug loud rather than looking like a no-op.
 */
export async function archiveLookup(
  table: LookupTable,
  id: string,
  returnTo: string,
): Promise<void> {
  const actor = await getSuperadminActor();
  if (!actor) throw new Error("forbidden");

  const { error } = await actor.supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString(), deleted_by: actor.userId })
    .eq("id", id)
    .is("deleted_at", null); // idempotent: never re-stamp an already-archived row

  if (error) throw new Error("archive failed");

  revalidatePath(BASE);
  redirect(safeReturn(returnTo, BASE, { undo: id }));
}

export async function restoreLookup(
  table: LookupTable,
  id: string,
  returnTo: string,
): Promise<void> {
  const actor = await getSuperadminActor();
  if (!actor) throw new Error("forbidden");

  const { error } = await actor.supabase
    .from(table)
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id);

  if (error) throw new Error("restore failed");

  revalidatePath(BASE);
  redirect(safeReturn(returnTo, BASE));
}
