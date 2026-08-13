import { Field } from "@/components/shared/Field";
import { SEX_OPTIONS, type ProfileField } from "@/lib/patients/schema";
import type { FieldErrors, Values } from "@/lib/forms/action-state";

/**
 * The /profile form's controls, with no form and no action.
 *
 * Presentational and props-only so the real screen and the gallery specimen
 * render the same markup (07-contributing.md).
 *
 * NOT PatientForm, and not a variant of it. That component is bound to
 * `PatientField`, renders `email`, and carries the DuplicateWarning slot — none
 * of which belongs here. Three near-identical forms (staff / register / profile)
 * is the right answer over one generic form: they differ in which fields exist,
 * which are required, whether there is a wizard, and whether a duplicate warning
 * can appear. The parts genuinely worth sharing already are — `Field`,
 * `SubmitButton`, `InlineAlert` and the `ActionState` helpers.
 *
 * `dob` is required here, matching /register: everyone with a profile came
 * through it, so this asks nothing new.
 */
export function ProfileFields({
  values,
  errors,
}: {
  values: Values<ProfileField>;
  errors: FieldErrors<ProfileField>;
}) {
  const v = (f: ProfileField) => values[f] ?? "";

  return (
    <>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">Your name</legend>
        <Field
          name="first_name"
          label="First name"
          required
          autoComplete="given-name"
          defaultValue={v("first_name")}
          error={errors.first_name}
        />
        <Field
          name="middle_name"
          label="Middle name"
          autoComplete="additional-name"
          defaultValue={v("middle_name")}
          error={errors.middle_name}
        />
        <Field
          name="last_name"
          label="Last name"
          required
          autoComplete="family-name"
          defaultValue={v("last_name")}
          error={errors.last_name}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">Your details</legend>
        <Field
          name="dob"
          label="Date of birth"
          type="date"
          required
          autoComplete="bday"
          defaultValue={v("dob")}
          error={errors.dob}
        />
        <Field
          name="phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="Used for appointment reminders."
          defaultValue={v("phone")}
          error={errors.phone}
        />
        <Field
          name="sex"
          label="Sex"
          as="select"
          options={SEX_OPTIONS}
          defaultValue={v("sex") || "undisclosed"}
          error={errors.sex}
        />
        <Field
          name="address"
          label="Address"
          as="textarea"
          rows={2}
          autoComplete="street-address"
          defaultValue={v("address")}
          error={errors.address}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">Emergency contact</legend>
        <Field
          name="emergency_contact_name"
          label="Name"
          autoComplete="off"
          defaultValue={v("emergency_contact_name")}
          error={errors.emergency_contact_name}
        />
        <Field
          name="emergency_contact_phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={v("emergency_contact_phone")}
          error={errors.emergency_contact_phone}
        />
      </fieldset>

      <Field
        name="marketing_opt_in"
        label="Send clinic news and offers"
        as="checkbox"
        hint="Appointment reminders are sent regardless — this covers marketing only."
        defaultChecked={v("marketing_opt_in") === "on"}
      />
    </>
  );
}
