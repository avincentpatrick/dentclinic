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
 * The `<form>` wrapper every record editor shares.
 *
 * Extracted from `components/lookups/LookupForm.tsx` in 2.2d, when the feedback
 * screens needed the identical thing — the same move `src/lib/list/query.ts`
 * made in 2.2b, and for the same stated reason: copying a file whose comment
 * warns about the third caller IS the failure it warns about. `LookupForm`
 * re-exports this, so no lookups call site changed.
 *
 * Generic over the field union, with the controls passed in as a render prop.
 * Forms differ only in which fields they show, so the parts that are easy to
 * get wrong — `noValidate`, the echo-vs-initial precedence, the success alert,
 * the pending submit — are written once.
 *
 * `noValidate` because the server is the single source of truth for messages
 * (forms.md): otherwise the browser and `parseForm` disagree about what is
 * acceptable and the user is told two different things.
 *
 * REMEMBER (PROGRESS decision 22): `fields` is a plain function, and a plain
 * function CANNOT be passed from a Server Component to a Client Component —
 * only Server Actions can. Every page that renders this needs a thin
 * `"use client"` wrapper in between. That mistake 500'd all six lookups
 * create/edit routes past a fully green build; since 2.2d the authenticated
 * Playwright suite catches it, but the wrapper is still the fix.
 */
export function RecordForm<F extends string>({
  action,
  initial,
  fields,
  submitLabel,
  pendingLabel = "Saving…",
  cancelHref,
  initialState,
}: {
  action: (prev: ActionState<F>, formData: FormData) => Promise<ActionState<F>>;
  /** Existing row values on edit; defaults on create. */
  initial: Values<F>;
  fields: (args: { values: Values<F>; errors: FieldErrors<F> }) => React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
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
        <SubmitButton idleLabel={submitLabel} pendingLabel={pendingLabel} />
        <Button asChild variant="ghost" className="min-h-11">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
