"use client";

import { LookupForm } from "@/components/lookups/LookupForm";
import { OperatoryFields, type ProviderOption } from "@/components/lookups/OperatoryFields";
import type { ActionState, Values } from "@/lib/forms/action-state";
import type { OperatoryField } from "@/lib/lookups/schema";

/** Client wrapper — see AppointmentTypeForm for why the render prop needs one. */
export function OperatoryForm({
  action,
  initial,
  providers,
  submitLabel,
}: {
  action: (
    prev: ActionState<OperatoryField>,
    formData: FormData,
  ) => Promise<ActionState<OperatoryField>>;
  initial: Values<OperatoryField>;
  providers: readonly ProviderOption[];
  submitLabel: string;
}) {
  return (
    <LookupForm<OperatoryField>
      action={action}
      initial={initial}
      fields={({ values, errors }) => (
        <OperatoryFields values={values} errors={errors} providers={providers} />
      )}
      submitLabel={submitLabel}
      cancelHref="/admin/lookups/operatories"
    />
  );
}
