"use client";

import { useActionState } from "react";
import Link from "next/link";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { SubmitButton } from "@/components/shared/SubmitButton";
import { Button } from "@/components/ui/button";
import {
  IDLE,
  errorsOf,
  formErrorOf,
  hasValues,
  type ActionState,
  type FieldErrors,
  type Values,
} from "@/lib/forms/action-state";

/**
 * The `<form>` wrapper every lookups editor shares.
 *
 * Generic over the field union, with the controls passed in as a render prop.
 * The three lookups forms differ only in which fields they show, so the parts
 * that are easy to get wrong — `noValidate`, the echo-vs-initial precedence,
 * the success alert, the pending submit — are written once.
 *
 * `noValidate` because the server is the single source of truth for messages
 * (forms.md): otherwise the browser and `parseForm` disagree about what is
 * acceptable and the user is told two different things.
 */
export function LookupForm<F extends string>({
  action,
  initial,
  fields,
  submitLabel,
  cancelHref,
  initialState,
}: {
  action: (prev: ActionState<F>, formData: FormData) => Promise<ActionState<F>>;
  /** Existing row values on edit; defaults on create. */
  initial: Values<F>;
  fields: (args: { values: Values<F>; errors: FieldErrors<F> }) => React.ReactNode;
  submitLabel: string;
  cancelHref: string;
  /** Seeds a non-idle state so the gallery can prove the error/success shapes. */
  initialState?: ActionState<F>;
}) {
  const [state, formAction] = useActionState(action, initialState ?? (IDLE as ActionState<F>));

  const errors = errorsOf(state);
  const formError = formErrorOf(state);

  // The round trip wins over the initial row: after a rejected submit the user
  // must see what THEY typed, not what the database still holds.
  const values = hasValues(state) ? ((state as { values: Values<F> }).values ?? initial) : initial;

  return (
    <form action={formAction} noValidate className="mt-6 flex flex-col gap-6">
      {formError && <InlineAlert tone="danger" title={formError} />}
      {state.status === "success" && <InlineAlert tone="success" title={state.message} />}

      {fields({ values, errors })}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton idleLabel={submitLabel} pendingLabel="Saving…" />
        <Button asChild variant="ghost" className="min-h-11">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
