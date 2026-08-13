"use client";

import { AppointmentTypeFields } from "@/components/lookups/AppointmentTypeFields";
import { LookupForm } from "@/components/lookups/LookupForm";
import type { ActionState, Values } from "@/lib/forms/action-state";
import type { AppointmentTypeField } from "@/lib/lookups/schema";

/**
 * A client wrapper so the render prop never crosses the Server boundary.
 *
 * `LookupForm` takes `fields` as a function, and **a plain function cannot be
 * passed from a Server Component to a Client Component** — only Server Actions
 * can. Rendering `<LookupForm fields={…}>` straight from a page produced a 500
 * on every create and edit route until this layer existed. Between two client
 * components the same prop is ordinary.
 *
 * This is the same constraint the gallery already documents for specimens; it
 * bites in exactly the same way in application code.
 */
export function AppointmentTypeForm({
  action,
  initial,
  submitLabel,
}: {
  action: (
    prev: ActionState<AppointmentTypeField>,
    formData: FormData,
  ) => Promise<ActionState<AppointmentTypeField>>;
  initial: Values<AppointmentTypeField>;
  submitLabel: string;
}) {
  return (
    <LookupForm<AppointmentTypeField>
      action={action}
      initial={initial}
      fields={({ values, errors }) => <AppointmentTypeFields values={values} errors={errors} />}
      submitLabel={submitLabel}
      cancelHref="/admin/lookups/appointment-types"
    />
  );
}
