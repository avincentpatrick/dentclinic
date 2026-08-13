import { Field } from "@/components/shared/Field";
import {
  BUFFER_MAX_UNITS,
  COLOR_OPTIONS,
  DURATION_MAX_UNITS,
  DURATION_MIN_UNITS,
  type AppointmentTypeField,
} from "@/lib/lookups/schema";
import type { FieldErrors, Values } from "@/lib/forms/action-state";

/**
 * The appointment-type form's controls, with no form and no action.
 *
 * Presentational and props-only so the real screen and the gallery specimen
 * render the SAME markup — a `layouts` entry that re-types the page drifts
 * within an increment and then proves nothing (07-contributing.md).
 *
 * MINUTES IN THE UI, UNITS IN THE DATABASE. Every field here is named
 * `*_minutes` and every column is `*_units`; `tenMinuteUnits` in
 * `src/lib/forms/validation.ts` is the only thing that converts, and a
 * non-multiple of 10 is rejected rather than rounded — a schedule silently five
 * minutes wrong per appointment is worse than a form error.
 */
export function AppointmentTypeFields({
  values,
  errors,
}: {
  values: Values<AppointmentTypeField>;
  errors: FieldErrors<AppointmentTypeField>;
}) {
  const v = (f: AppointmentTypeField) => values[f] ?? "";

  return (
    <>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">What it is</legend>

        <Field
          name="name"
          label="Name"
          required
          defaultValue={v("name")}
          error={errors.name}
          hint="What staff and patients see in the picker and on the calendar."
        />
        <Field
          as="textarea"
          name="description"
          label="Description"
          rows={2}
          defaultValue={v("description")}
          error={errors.description}
          hint="Optional. Shown to patients when they choose this in Phase 4 booking."
        />
        <Field
          as="select"
          name="color"
          label="Calendar colour"
          options={COLOR_OPTIONS}
          defaultValue={v("color") || "teal"}
          error={errors.color}
          hint="Used by the Phase 3 calendar. The name is what a screen reader announces, so colour is never the only cue."
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">How long it takes</legend>

        <Field
          name="duration_minutes"
          label="Duration (minutes)"
          type="number"
          inputMode="numeric"
          required
          min={DURATION_MIN_UNITS * 10}
          max={DURATION_MAX_UNITS * 10}
          step={10}
          defaultValue={v("duration_minutes")}
          error={errors.duration_minutes}
          hint="In 10-minute steps. This is the time the patient is in the chair."
        />
        <Field
          name="pre_buffer_minutes"
          label="Set-up buffer (minutes)"
          type="number"
          inputMode="numeric"
          min={0}
          max={BUFFER_MAX_UNITS * 10}
          step={10}
          defaultValue={v("pre_buffer_minutes") || "0"}
          error={errors.pre_buffer_minutes}
          hint="Blocked before the visit — room set-up, anaesthetic onset. Not shown to the patient."
        />
        <Field
          name="post_buffer_minutes"
          label="Turnover buffer (minutes)"
          type="number"
          inputMode="numeric"
          min={0}
          max={BUFFER_MAX_UNITS * 10}
          step={10}
          defaultValue={v("post_buffer_minutes") || "0"}
          error={errors.post_buffer_minutes}
          hint="Blocked after the visit — turnover and disinfection. Buffers consume chair time invisibly, so keep them honest."
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">Who can book it</legend>

        <Field
          as="checkbox"
          name="patient_bookable"
          label="Patients can book this themselves"
          defaultChecked={v("patient_bookable") === "on"}
          error={errors.patient_bookable}
          hint="Leave off for treatment a patient cannot self-diagnose — a filling, an extraction, a crown."
        />
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
    </>
  );
}
