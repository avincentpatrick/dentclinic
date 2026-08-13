"use client";

import { useActionState } from "react";
import Link from "next/link";
import { DuplicateWarning } from "@/components/patients/DuplicateWarning";
import { Field } from "@/components/shared/Field";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { SubmitButton } from "@/components/shared/SubmitButton";
import { Button } from "@/components/ui/button";
import {
  IDLE,
  errorsOf,
  formErrorOf,
  hasValues,
  valueOf,
  type ActionState,
} from "@/lib/forms/action-state";
import { SEX_OPTIONS, type PatientField } from "@/lib/patients/schema";

type PatientAction = (
  prev: ActionState<PatientField>,
  formData: FormData,
) => Promise<ActionState<PatientField>>;

export type PatientFormValues = Partial<Record<PatientField, string>>;

/**
 * The walk-in create/edit form, shared by /patients/new and /patients/[id]/edit.
 *
 * Two submit buttons live in this one form: the primary one, and — only while a
 * duplicate warning is showing — DuplicateWarning's "Create a separate record".
 * They differ solely in that the second carries the ack as its own name/value,
 * so the primary can never accidentally acknowledge a warning. Both are
 * SubmitButtons, so `useFormStatus` disables both while pending: a double
 * submit here is two patients.
 *
 * `noValidate` because the server is the single source of truth for messages
 * (forms.md) — otherwise the browser and `parseForm` disagree about what is
 * acceptable and the user is told two different things.
 */
export function PatientForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: PatientAction;
  /** Existing column values on edit; empty on create. */
  initial?: PatientFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, IDLE as ActionState<PatientField>);

  const errors = errorsOf(state);
  const formError = formErrorOf(state);

  // The round trip wins over the initial row: after a rejected submit the user
  // must see what THEY typed, not what the database still holds. `hasValues`
  // rather than `"values" in state`, because a create that redirected returns a
  // bare success with nothing to echo.
  const echoed = hasValues(state);
  const v = (field: PatientField) => (echoed ? valueOf(state, field) : (initial?.[field] ?? ""));
  const checked = (field: PatientField) =>
    echoed ? valueOf(state, field) === "on" : initial?.[field] === "on";

  return (
    <form action={formAction} noValidate className="mt-6 flex flex-col gap-6">
      {state.status === "confirm" && <DuplicateWarning confirm={state.confirm} />}

      {formError && <InlineAlert tone="danger" title={formError} />}

      {state.status === "success" && (
        <InlineAlert tone="success" title={state.message} />
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">Name</legend>
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
        <legend className="mb-2 text-sm font-medium text-muted-foreground">Contact</legend>
        <Field
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          hint="Used for reminders, and to link a record when this patient signs in."
          defaultValue={v("email")}
          error={errors.email}
        />
        <Field
          name="phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={v("phone")}
          error={errors.phone}
        />
        <Field
          name="dob"
          label="Date of birth"
          type="date"
          autoComplete="bday"
          hint="Leave blank if unknown — a guessed date makes the duplicate check unreliable."
          defaultValue={v("dob")}
          error={errors.dob}
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
        <legend className="mb-2 text-sm font-medium text-muted-foreground">
          Emergency contact
        </legend>
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
        defaultChecked={checked("marketing_opt_in")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton idleLabel={submitLabel} pendingLabel="Saving…" />
        <Button asChild variant="ghost" className="min-h-11">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
