"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/actor";
import { echo, parseForm } from "@/lib/forms/validation";
import { PROFILE_FIELDS, profileSchema, type ProfileField } from "@/lib/patients/schema";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The signed-in person editing their own patient record.
 *
 * A THIRD action file, and the reason is the guard rather than tidiness.
 * `actions/patients.ts` declares that every export re-checks the STAFF role;
 * `actions/registration.ts` declares `requirePatient()`. `/profile` is neither:
 * `ROUTE_RULES` grants it to ALL_ROLES, and `update_own_patient` is not
 * role-restricted either — it keys on `auth.uid()` and no-ops to
 * `no_patient_record` for anyone without a row. **A `requirePatient()` guard
 * here would break `/profile` for the three roles the route table deliberately
 * grants it to.**
 *
 * So the check is `getActor()` — "there is a session" genuinely is the whole
 * check at this layer, and the real allow-list is the RPC's parameter list:
 * everything clinical, administrative or identifying is unreachable because it
 * is not a parameter.
 */

export async function updateOwnProfile(
  _prev: ActionState<ProfileField>,
  formData: FormData,
): Promise<ActionState<ProfileField>> {
  // Echo FIRST, so every failure path below returns the user's typing intact.
  const values = echo(formData, PROFILE_FIELDS);

  const actor = await getActor();
  if (!actor) {
    return { status: "error", formError: "Your session has expired. Sign in and try again.", values };
  }

  const parsed = parseForm(formData, profileSchema);
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };
  const v = parsed.value;

  const { error } = await actor.supabase.rpc("update_own_patient", {
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
    // NO p_email. The RPC has no parameter for it: it is the account identity
    // and the claim key, and letting it drift here would silently break
    // claim_or_create_patient.
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("not_authenticated")) redirect("/login");
    if (message.includes("name_required")) {
      return {
        status: "invalid",
        fieldErrors: { first_name: "Enter your first and last name." },
        values,
      };
    }
    // P0002. Reachable two ways: a staff-side user with no patients row replaying
    // the action id (an ordinary error, and it leaks nothing), or a patient whose
    // record was archived between page load and submit — the real case, and the
    // message tells them what to do about it.
    //
    // There is deliberately NO pre-flight existence check: this IS the check, and
    // a pre-check would be a TOCTOU race plus a round trip.
    if (message.includes("no_patient_record")) {
      return {
        status: "error",
        formError:
          "We couldn't find an active record for your account. If you've just registered, reload this page; otherwise contact the clinic.",
        values,
      };
    }
    return { status: "error", formError: "Couldn't save your details. Try again.", values };
  }

  revalidatePath("/profile");
  revalidatePath("/home");
  // A patient editing their own record changes what the front desk sees.
  revalidatePath("/patients");

  // Stays put, so `values` is REQUIRED — React resets a form to its
  // defaultValue attributes when the action completes, so a bare success would
  // blank the fields the save just wrote.
  return { status: "success", message: "Your details are saved.", values };
}
