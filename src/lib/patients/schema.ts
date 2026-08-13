import {
  checkbox,
  emailOptional,
  isoDate,
  oneOf,
  optional,
  phone,
  required,
  type Schema,
} from "@/lib/forms/validation";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Field names, options and the parse schema for the patient forms.
 *
 * These live HERE and not in `app/actions/patients.ts` because a `"use server"`
 * module may export only async functions — a `const` array export in one is a
 * build error, and a confusing one. Type-only exports would be fine (they are
 * erased); `PATIENT_FIELDS` is not.
 */

export type PatientSex = Database["public"]["Enums"]["patient_sex"];

export const SEX_VALUES = ["female", "male", "other", "undisclosed"] as const satisfies readonly PatientSex[];

export const SEX_OPTIONS: readonly { value: PatientSex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "undisclosed", label: "Prefer not to say" },
];

/**
 * The staff-writable columns, in form order. `patient_number`, `full_name` and
 * `phone_norm` are generated; `is_provisional`, `merged_into_id`,
 * `primary_provider_id`, `recall_disabled` and `deleted_at` are not form fields.
 *
 * `primary_provider_id` is deliberately absent until 2.2b — there are no
 * `providers` rows to choose from yet, and a select with no options is worse
 * than no select.
 */
export const PATIENT_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "email",
  "dob",
  "phone",
  "sex",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
  "marketing_opt_in",
] as const;

export type PatientField = (typeof PATIENT_FIELDS)[number];

/**
 * `minYear: 1901`, not 1900, and the off-by-one is the point.
 *
 * The DB's `patients_dob_sane` is `dob > date '1900-01-01'` — strictly greater,
 * so 1900-01-01 itself is rejected. A validator with `minYear: 1900` accepts it
 * and hands the database a row it will refuse, producing an error message the
 * form cannot attach to a field. forms.md is explicit that client and server
 * bounds must agree; this is the same class of defect 0006 fixed at the other
 * end of the range.
 *
 * `notFuture` allows TOMORROW for the matching reason: the constraint is
 * `<= current_date + 1` because the server is UTC and the clinic is UTC+8.
 *
 * `required: false` on the staff form because `patients.dob` is nullable and a
 * walk-in in pain does not always know their date of birth. Requiring it here
 * would push staff to invent one, which is worse than a blank: an invented dob
 * makes the duplicate probe confidently wrong. `/register` requires it — the
 * patient knows their own — see registerSchema.
 */
export const patientSchema = {
  first_name: required("First name", 80),
  middle_name: optional(80),
  last_name: required("Last name", 80),
  email: emailOptional,
  dob: isoDate({ label: "Date of birth", notFuture: true, minYear: 1901, required: false }),
  phone,
  sex: oneOf(SEX_VALUES, "Sex"),
  address: optional(300),
  emergency_contact_name: optional(120),
  emergency_contact_phone: phone,
  marketing_opt_in: checkbox,
} satisfies Schema<{
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  dob: string | null;
  phone: string | null;
  sex: PatientSex;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  marketing_opt_in: boolean;
}>;

/**
 * Self-registration. The same person, minus the two things a patient may not
 * set about themselves:
 *
 *   - `email` — it is the account identity AND the claim key, so it comes from
 *     `auth.users` via `claim_or_create_patient`, never from the form
 *     (03-patients.md rule 3). Adding it here would recreate the enumeration
 *     endpoint that design exists to prevent.
 *   - plus `consent`, which staff never capture on someone's behalf.
 */
export const REGISTER_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "dob",
  "phone",
  "sex",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
  "marketing_opt_in",
  "consent",
] as const;

export type RegisterField = (typeof REGISTER_FIELDS)[number];

/** Step 1 is identity; step 2 is contact + consent. Validated separately. */
export const REGISTER_STEP1_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "dob",
  "phone",
  "sex",
] as const satisfies readonly RegisterField[];

export const registerStep1Schema = {
  first_name: patientSchema.first_name,
  middle_name: patientSchema.middle_name,
  last_name: patientSchema.last_name,
  // Required here, optional on the staff form: a person registering themselves
  // knows their own date of birth, and it is what lets the clinic tell them
  // apart from a relative sharing the same surname and mailbox.
  dob: isoDate({ label: "Date of birth", notFuture: true, minYear: 1901 }),
  phone: patientSchema.phone,
  sex: patientSchema.sex,
};

export const registerSchema = {
  ...registerStep1Schema,
  address: patientSchema.address,
  emergency_contact_name: patientSchema.emergency_contact_name,
  emergency_contact_phone: patientSchema.emergency_contact_phone,
  marketing_opt_in: patientSchema.marketing_opt_in,
  consent: checkbox,
};

/**
 * `/profile` — exactly `update_own_patient`'s parameter list, no more and no
 * less. Written out rather than derived from REGISTER_FIELDS so the tuple type
 * survives and a mismatch with the RPC is visible in one place.
 *
 * `email` is absent because **the RPC has no parameter for it**: it is the
 * account identity and the claim key, and letting it drift here would silently
 * break `claim_or_create_patient` (0005, 03-patients.md rule 5). Changing an
 * email belongs to Supabase Auth's own verified change flow.
 *
 * `consent` is absent because consent is given once at registration and
 * re-signed at recall in Phase 6.1 — it is not a profile preference.
 */
export const PROFILE_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "dob",
  "phone",
  "sex",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
  "marketing_opt_in",
] as const satisfies readonly RegisterField[];

export type ProfileField = (typeof PROFILE_FIELDS)[number];

/**
 * `dob` is REQUIRED here, matching `/register` rather than the staff form.
 * Everyone with a profile came through `/register`, which already requires it,
 * so this asks nothing new — and `patientSchema`'s "leave blank if unknown"
 * allowance is about a walk-in in pain at the front desk, not about someone
 * editing their own record at leisure.
 */
export const profileSchema = {
  first_name: patientSchema.first_name,
  middle_name: patientSchema.middle_name,
  last_name: patientSchema.last_name,
  dob: registerStep1Schema.dob,
  phone: patientSchema.phone,
  sex: patientSchema.sex,
  address: patientSchema.address,
  emergency_contact_name: patientSchema.emergency_contact_name,
  emergency_contact_phone: patientSchema.emergency_contact_phone,
  marketing_opt_in: patientSchema.marketing_opt_in,
};

/**
 * Stamped alongside `consent_given_at` (the `patients_consent_versioned` CHECK
 * is both-or-neither) so a later change to the privacy notice is detectable per
 * patient. Bump this when the notice text changes — that is the whole point of
 * versioning it.
 */
export const CONSENT_VERSION = "2026-08-13";
