import { Field } from "@/components/shared/Field";
import {
  SEVERITY_OPTIONS,
  STATUS_OPTIONS,
  TRIAGE_NOTE_MAX,
  type TriageField,
} from "@/lib/feedback/schema";
import type { FieldErrors, Values } from "@/lib/forms/action-state";

/**
 * The superadmin's triage controls.
 *
 * Only three fields, and that is the point: `title`, `body`, `path`, `kind` and
 * the reporter are pinned immutable by `feedback_reports_guard` (migration
 * 0015), because a filed report is a fact (16-feedback.md rule 6). There is no
 * comment table in Phase 2, so an editable body would let a report be rewritten
 * underneath a triage note that answered the original.
 */
export function TriageFields({
  values,
  errors,
}: {
  values: Values<TriageField>;
  errors: FieldErrors<TriageField>;
}) {
  const v = (f: TriageField) => values[f] ?? "";

  return (
    <fieldset className="flex flex-col gap-6">
      <legend className="sr-only">Triage</legend>

      <Field
        as="select"
        name="status"
        label="Status"
        required
        defaultValue={v("status")}
        options={STATUS_OPTIONS}
        hint="Resolving or closing a report stamps who did it and when."
        error={errors.status}
      />

      <Field
        as="select"
        name="severity"
        label="Severity"
        required
        defaultValue={v("severity")}
        options={SEVERITY_OPTIONS}
        hint="The reporter's answer, which you can override."
        error={errors.severity}
      />

      <Field
        as="textarea"
        name="triage_note"
        label="Triage note"
        rows={4}
        defaultValue={v("triage_note")}
        // Same warning as the report body, for the same reason: this is free
        // text, and free text collects patient names. The narrow audit trigger
        // never copies it anywhere, but the reporter can see the status it
        // produces.
        hint={`Visible only here. Don't include patient details. Up to ${TRIAGE_NOTE_MAX.toLocaleString()} characters.`}
        error={errors.triage_note}
      />
    </fieldset>
  );
}
