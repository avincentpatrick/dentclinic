import { Field } from "@/components/shared/Field";
import type { OperatoryField } from "@/lib/lookups/schema";
import type { FieldErrors, Values } from "@/lib/forms/action-state";

export type ProviderOption = { value: string; label: string };

/**
 * The operatory form's controls, with no form and no action.
 *
 * The default-provider select is rendered ONLY when live providers exist. There
 * is no provider admin screen yet — `providers` shipped in 0005 because
 * `patients.primary_provider_id` and `operatories.default_provider_id` needed
 * something to point at — so on a fresh install the table is empty, and an empty
 * select is a control that looks broken rather than one that is not applicable.
 * `src/lib/patients/schema.ts` describes the same situation for
 * `primary_provider_id`.
 */
export function OperatoryFields({
  values,
  errors,
  providers,
}: {
  values: Values<OperatoryField>;
  errors: FieldErrors<OperatoryField>;
  providers: readonly ProviderOption[];
}) {
  const v = (f: OperatoryField) => values[f] ?? "";

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">Chair</legend>

      <Field
        name="name"
        label="Name"
        required
        defaultValue={v("name")}
        error={errors.name}
        hint="What the calendar column is headed — “Op 1”, “Hygiene 1”."
      />

      <Field
        as="checkbox"
        name="is_hygiene"
        label="This is a hygiene chair"
        defaultChecked={v("is_hygiene") === "on"}
        error={errors.is_hygiene}
        hint="Hygiene chairs get their own column on the Phase 3 calendar."
      />

      {providers.length > 0 ? (
        <Field
          as="select"
          name="default_provider_id"
          label="Usual provider"
          options={[{ value: "", label: "No default" }, ...providers]}
          defaultValue={v("default_provider_id")}
          error={errors.default_provider_id}
          hint="Optional. Pre-selected when booking into this chair."
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          A usual provider can be set once the clinic has providers. Adding them arrives with the
          scheduling module.
        </p>
      )}

      <Field
        name="sort_order"
        label="Order"
        type="number"
        inputMode="numeric"
        required
        min={0}
        max={9999}
        defaultValue={v("sort_order") || "0"}
        error={errors.sort_order}
        hint="Left-to-right order of the calendar columns."
      />
    </fieldset>
  );
}
