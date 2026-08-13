"use client";

import { TriageFields } from "@/components/feedback-report/TriageFields";
import { RecordForm } from "@/components/shared/RecordForm";
import type { ActionState, Values } from "@/lib/forms/action-state";
import type { TriageField } from "@/lib/feedback/schema";

/** Client wrapper — see FeedbackForm for why the render prop needs one. */
export function TriageForm({
  action,
  initial,
  cancelHref,
  initialState,
}: {
  action: (prev: ActionState<TriageField>, formData: FormData) => Promise<ActionState<TriageField>>;
  initial: Values<TriageField>;
  cancelHref: string;
  initialState?: ActionState<TriageField>;
}) {
  return (
    <RecordForm<TriageField>
      action={action}
      initial={initial}
      fields={({ values, errors }) => <TriageFields values={values} errors={errors} />}
      submitLabel="Save triage"
      cancelHref={cancelHref}
      initialState={initialState}
    />
  );
}
