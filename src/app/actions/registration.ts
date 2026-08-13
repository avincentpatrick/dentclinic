"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/actor";
import { echo, parseForm } from "@/lib/forms/validation";
import {
  CONSENT_VERSION,
  REGISTER_FIELDS,
  registerSchema,
  registerStep1Schema,
  type RegisterField,
} from "@/lib/patients/schema";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Patient self-registration.
 *
 * Kept out of `actions/patients.ts` on purpose: that file is the staff
 * allow-list and this one is the patient allow-list, and the two have visibly
 * different blast radii. Everything here goes through
 * `claim_or_create_patient`, whose parameter list IS the column allow-list —
 * patients have no INSERT or UPDATE policy on `patients` at all.
 *
 * NOTHING HERE MAY EVER CALL find_patient_duplicates, and no response may
 * differ depending on whether a matching record exists. That is not a style
 * preference: `claim_or_create_patient` takes no email precisely so there is no
 * attacker-supplied selector, and a "we found your record" message would hand
 * back the enumeration oracle that design removes. See 03-patients.md rule 3.
 */

const GENERIC_FAILURE = "We couldn't save your details. Please try again.";

async function requirePatient() {
  const actor = await getActor();
  return actor?.role === "patient" ? actor : null;
}

/**
 * Step 1 of 2. Validates identity fields server-side and says nothing else —
 * it writes nothing, so it cannot half-register anyone.
 *
 * The client advances to step 2 on `success` and stays put on `invalid`, which
 * is what makes this "posts per step": each step is checked by its own round
 * trip rather than by a client-side validator that could disagree with the one
 * that matters.
 */
export async function validateRegistrationStep1(
  _prev: ActionState<RegisterField>,
  formData: FormData,
): Promise<ActionState<RegisterField>> {
  const values = echo(formData, REGISTER_FIELDS);

  const actor = await requirePatient();
  if (!actor) return { status: "error", formError: GENERIC_FAILURE, values };

  const parsed = parseForm(formData, registerStep1Schema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };

  // `values` is load-bearing, not decoration. React resets the form to its
  // defaultValue attributes when the action completes, so a bare success here
  // wipes every step-1 field the user just filled in — and because they are on
  // step 2 by then, they cannot see it happen. The final submit would post
  // empty strings and reject their own name as missing.
  return { status: "success", message: "Your details look good.", values };
}

export async function registerPatient(
  _prev: ActionState<RegisterField>,
  formData: FormData,
): Promise<ActionState<RegisterField>> {
  const values = echo(formData, REGISTER_FIELDS);

  const actor = await requirePatient();
  if (!actor) return { status: "error", formError: GENERIC_FAILURE, values };

  // Re-validates STEP 1 TOO. Step 1's values arrive from the browser like any
  // other field, and "it already passed" is a claim the client makes.
  const parsed = parseForm(formData, registerSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  // Caught here so the DB's `consent_required` is a backstop, not the UX.
  if (!v.consent) {
    return {
      status: "invalid",
      fieldErrors: { consent: "Please confirm you have read the privacy notice." },
      values,
    };
  }

  const { data: patientId, error } = await actor.supabase.rpc("claim_or_create_patient", {
    p_first_name: v.first_name,
    p_last_name: v.last_name,
    p_middle_name: v.middle_name ?? undefined,
    p_dob: v.dob ?? undefined,
    p_phone: v.phone ?? undefined,
    p_sex: v.sex,
    p_address: v.address ?? undefined,
    p_emergency_name: v.emergency_contact_name ?? undefined,
    p_emergency_phone: v.emergency_contact_phone ?? undefined,
    p_marketing_opt_in: v.marketing_opt_in,
    p_consent_version: CONSENT_VERSION,
    // NO p_email. Ever. It is read from auth.users for auth.uid() and must be
    // confirmed there.
  });

  if (error) {
    // Mapped narrowly and never revealingly. Note what is NOT distinguishable
    // from the outside: whether a record was claimed, created, or created
    // provisional because the address already belonged to another live row.
    // All three are successes to the caller, by design.
    const message = error.message ?? "";
    if (message.includes("no_verified_email")) {
      return {
        status: "error",
        formError:
          "Confirm your email address first — check your inbox for the sign-in link, then come back.",
        values,
      };
    }
    if (message.includes("not_authenticated")) redirect("/login");
    if (message.includes("consent_required")) {
      return {
        status: "invalid",
        fieldErrors: { consent: "Please confirm you have read the privacy notice." },
        values,
      };
    }
    if (message.includes("name_required")) {
      return {
        status: "invalid",
        fieldErrors: { first_name: "Enter your first and last name." },
        values,
      };
    }
    return { status: "error", formError: GENERIC_FAILURE, values };
  }

  if (!patientId) return { status: "error", formError: GENERIC_FAILURE, values };

  revalidatePath("/home");
  revalidatePath("/profile");
  // The same landing whether the RPC claimed a walk-in, created a new row, or
  // created a provisional one. The patient never learns which.
  redirect("/home?registered=1");
}
