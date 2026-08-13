"use client";

import { useActionState, useState } from "react";
import { registerPatient, validateRegistrationStep1 } from "@/app/actions/registration";
import { Field } from "@/components/shared/Field";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { SubmitButton } from "@/components/shared/SubmitButton";
import { Button } from "@/components/ui/button";
import { IDLE, errorsOf, formErrorOf, valueOf, type ActionState } from "@/lib/forms/action-state";
import { REGISTER_STEP1_FIELDS, SEX_OPTIONS, type RegisterField } from "@/lib/patients/schema";

type RegisterState = ActionState<RegisterField>;

/**
 * Self-registration, in two steps and one write.
 *
 * ## Why one <form> with two actions
 *
 * Both steps live in a single <form>; the inactive step's fields stay mounted
 * behind the `hidden` ATTRIBUTE, which suppresses rendering but NOT submission.
 * So step 1's values ride to the final POST as the very inputs the user typed
 * into, rather than being copied into a parallel set of hidden inputs that could
 * drift from what was on screen.
 *
 * Each button carries its own `formAction`, from its own `useActionState` hook:
 *
 *   Continue            -> validateRegistrationStep1  (writes nothing)
 *   Finish registration -> registerPatient            (the single RPC call)
 *
 * That is what "posts per step" means here — the server checks step 1 on its own
 * round trip, so there is no client-side validator that could disagree with the
 * one that actually decides. `registerPatient` then re-validates step 1 anyway:
 * "it already passed" is a claim the browser makes.
 *
 * ## Why no duplicate warning
 *
 * There is deliberately none. `claim_or_create_patient` takes no email — it
 * reads a verified one from auth.users — so there is nothing to probe with, and
 * `find_patient_duplicates` refuses the patient role outright. Whether this
 * person's record already existed is invisible here and stays invisible on the
 * success screen. See 03-patients.md rule 3.
 */
export function RegisterForm({ privacyNoticeHref }: { privacyNoticeHref?: string }) {
  const [step1, step1Action] = useActionState(validateRegistrationStep1, IDLE as RegisterState);
  const [submitState, submitAction] = useActionState(registerPatient, IDLE as RegisterState);

  const [step, setStep] = useState<1 | 2>(1);

  // The two hooks are independent, so `state` is whichever one last spoke.
  const state: RegisterState = submitState.status !== "idle" ? submitState : step1;
  const errors = errorsOf(state);
  const formError = formErrorOf(state);

  // ---------------------------------------------------------------------
  // Which step to show is ADJUSTED DURING RENDER, not synchronised in an
  // effect. React re-runs this component immediately with the corrected state
  // and never commits the wrong screen, so the user cannot see step 1 flash
  // before being moved to step 2 — which is exactly what a useEffect version
  // does, and why `react-hooks/set-state-in-effect` rejects it.
  //
  // The comparison is against the previous ACTION RESULT OBJECT, so a new
  // server response moves the step and an ordinary re-render (typing in a
  // field) does not. "Back" stays a plain event handler.
  // ---------------------------------------------------------------------
  const [seenStep1, setSeenStep1] = useState(step1);
  if (seenStep1 !== step1) {
    setSeenStep1(step1);
    if (step1.status === "success") setStep(2);
    if (step1.status === "invalid") setStep(1);
  }

  // A step-1 field rejected by the FINAL submit must send the user back to the
  // screen that field is on. Otherwise the form reports an error against an
  // input that is not on screen — the user sees a failure with nothing marked.
  const [seenSubmit, setSeenSubmit] = useState(submitState);
  if (seenSubmit !== submitState) {
    setSeenSubmit(submitState);
    const stepOneRejected =
      submitState.status === "invalid" &&
      REGISTER_STEP1_FIELDS.some((f) => errorsOf(submitState)[f]);
    if (stepOneRejected) setStep(1);
  }

  const v = (field: RegisterField) => valueOf(state, field);
  const checked = (field: RegisterField) => valueOf(state, field) === "on";

  return (
    <form noValidate className="mt-6 flex flex-col gap-6">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Step {step} of 2
      </p>

      {formError && <InlineAlert tone="danger" title={formError} />}

      {/* ---- Step 1: about you ------------------------------------------- */}
      <fieldset hidden={step !== 1} className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-medium">About you</legend>

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
        <Field
          name="dob"
          label="Date of birth"
          type="date"
          required
          autoComplete="bday"
          hint="This helps the clinic tell you apart from family members."
          defaultValue={v("dob")}
          error={errors.dob}
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
          name="sex"
          label="Sex"
          as="select"
          options={SEX_OPTIONS}
          defaultValue={v("sex") || "undisclosed"}
          error={errors.sex}
        />

        <div>
          <SubmitButton idleLabel="Continue" pendingLabel="Checking…" formAction={step1Action} />
        </div>
      </fieldset>

      {/* ---- Step 2: contact and consent ---------------------------------- */}
      <fieldset hidden={step !== 2} className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-medium">Contact and consent</legend>

        <Field
          name="address"
          label="Address"
          as="textarea"
          rows={2}
          autoComplete="street-address"
          defaultValue={v("address")}
          error={errors.address}
        />
        <Field
          name="emergency_contact_name"
          label="Emergency contact name"
          autoComplete="off"
          defaultValue={v("emergency_contact_name")}
          error={errors.emergency_contact_name}
        />
        <Field
          name="emergency_contact_phone"
          label="Emergency contact number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={v("emergency_contact_phone")}
          error={errors.emergency_contact_phone}
        />
        <Field
          name="marketing_opt_in"
          label="Send me clinic news and offers"
          as="checkbox"
          hint="Appointment reminders are sent either way — this is marketing only."
          defaultChecked={checked("marketing_opt_in")}
        />
        <Field
          name="consent"
          label="I have read and agree to the privacy notice"
          as="checkbox"
          required
          hint={
            privacyNoticeHref
              ? "The notice explains what the clinic records and how long it is kept."
              : "The clinic records your dental history to treat you safely."
          }
          defaultChecked={checked("consent")}
          error={errors.consent}
        />

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton
            idleLabel="Finish registration"
            pendingLabel="Saving…"
            formAction={submitAction}
          />
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => setStep(1)}
          >
            Back
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
