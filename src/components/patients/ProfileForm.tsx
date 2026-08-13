"use client";

import { useActionState } from "react";
import { ProfileFields } from "@/components/patients/ProfileFields";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { SubmitButton } from "@/components/shared/SubmitButton";
import {
  IDLE,
  errorsOf,
  formErrorOf,
  hasValues,
  valueOf,
  type ActionState,
  type Values,
} from "@/lib/forms/action-state";
import type { ProfileField } from "@/lib/patients/schema";

/**
 * The /profile editor.
 *
 * Stays put on success rather than redirecting — there is nowhere better to send
 * someone who just corrected their phone number — which is why the action
 * returns `values` and this reads them back. Without that React resets the form
 * to its `defaultValue` attributes when the action completes, blanking the very
 * fields the save just wrote (the measured /register step-1 bug).
 */
export function ProfileForm({
  action,
  initial,
  initialState,
}: {
  action: (prev: ActionState<ProfileField>, formData: FormData) => Promise<ActionState<ProfileField>>;
  initial: Values<ProfileField>;
  /** Seeds a non-idle state so the gallery can prove the error/success shapes. */
  initialState?: ActionState<ProfileField>;
}) {
  const [state, formAction] = useActionState(
    action,
    initialState ?? (IDLE as ActionState<ProfileField>),
  );

  const errors = errorsOf(state);
  const formError = formErrorOf(state);

  const echoed = hasValues(state);
  const values: Values<ProfileField> = echoed
    ? Object.fromEntries(
        (Object.keys(initial) as ProfileField[]).map((f) => [f, valueOf(state, f)]),
      )
    : initial;

  return (
    <form action={formAction} noValidate className="mt-6 flex flex-col gap-6">
      {formError && <InlineAlert tone="danger" title={formError} />}
      {state.status === "success" && <InlineAlert tone="success" title={state.message} />}

      <ProfileFields values={values} errors={errors} />

      <div>
        <SubmitButton idleLabel="Save my details" pendingLabel="Saving…" />
      </div>
    </form>
  );
}
