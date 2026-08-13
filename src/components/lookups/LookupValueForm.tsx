"use client";

import { LookupForm } from "@/components/lookups/LookupForm";
import { LookupValueFields } from "@/components/lookups/LookupValueFields";
import type { ActionState, Values } from "@/lib/forms/action-state";
import type { LookupValueField, LookupValueKind } from "@/lib/lookups/schema";

/** Client wrapper — see AppointmentTypeForm for why the render prop needs one. */
export function LookupValueForm({
  action,
  initial,
  kind,
  mode,
  currency,
  isSystem,
  slug,
  submitLabel,
}: {
  action: (
    prev: ActionState<LookupValueField>,
    formData: FormData,
  ) => Promise<ActionState<LookupValueField>>;
  initial: Values<LookupValueField>;
  kind: LookupValueKind;
  mode: "create" | "edit";
  currency: string;
  isSystem?: boolean;
  slug: string;
  submitLabel: string;
}) {
  return (
    <LookupForm<LookupValueField>
      action={action}
      initial={initial}
      fields={({ values, errors }) => (
        <LookupValueFields
          values={values}
          errors={errors}
          kind={kind}
          mode={mode}
          currency={currency}
          isSystem={isSystem}
        />
      )}
      submitLabel={submitLabel}
      cancelHref={`/admin/lookups/${slug}`}
    />
  );
}
