import { Field } from "@/components/shared/Field";
import type { LookupValueField, LookupValueKind } from "@/lib/lookups/schema";
import type { FieldErrors, Values } from "@/lib/forms/action-state";

/**
 * The generic lookup-value form's controls, with no form and no action.
 *
 * Two fields are conditional, and both conditions are load-bearing:
 *
 * - **`amount` only for a `money` category.** `lookup_values_guard` raises
 *   `amount_required` / `amount_not_allowed` on either mistake, so showing the
 *   field where it does not belong would offer the user a way to fail.
 * - **`code` only on create.** Changing a code splits a year of report grouping
 *   across two rows, which is the exact thing the column exists to prevent — so
 *   it is set once and never edited. `updateLookupValue` leaves it out of the
 *   payload entirely, and the database refuses it outright for built-in rows.
 */
export function LookupValueFields({
  values,
  errors,
  kind,
  mode,
  currency,
  isSystem,
}: {
  values: Values<LookupValueField>;
  errors: FieldErrors<LookupValueField>;
  kind: LookupValueKind;
  mode: "create" | "edit";
  currency: string;
  isSystem?: boolean;
}) {
  const v = (f: LookupValueField) => values[f] ?? "";

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">Entry</legend>

      <Field
        name="label"
        label="Label"
        required
        defaultValue={v("label")}
        error={errors.label}
        hint="What staff see in the picker."
      />

      {kind === "money" && (
        <Field
          name="amount"
          label={`Amount (${currency})`}
          type="number"
          inputMode="decimal"
          required
          min={0}
          step="0.01"
          defaultValue={v("amount")}
          error={errors.amount}
          hint="Copied onto an invoice line when it is added, so changing it later never rewrites an issued invoice."
        />
      )}

      {mode === "create" ? (
        <Field
          name="code"
          label="Code"
          defaultValue={v("code")}
          error={errors.code}
          hint="Optional, and permanent. Reports group by this, so it survives a rename — leave it blank if you are unsure."
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Code</span>
          <p className="text-base text-muted-foreground">{v("code") || "—"}</p>
          <p className="text-sm text-muted-foreground">
            {isSystem
              ? "This is a built-in entry. It can be renamed, but its code and its presence are relied on by the app."
              : "Set when the entry was created. Reports group by it, so it cannot be changed."}
          </p>
        </div>
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
        hint="Lower numbers come first in the picker."
      />
    </fieldset>
  );
}
