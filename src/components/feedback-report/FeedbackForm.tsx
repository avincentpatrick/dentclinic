"use client";

import { ClientContextFields } from "@/components/feedback-report/ClientContextFields";
import { FeedbackFields } from "@/components/feedback-report/FeedbackFields";
import { RecordForm } from "@/components/shared/RecordForm";
import type { ActionState, Values } from "@/lib/forms/action-state";
import type { FeedbackField } from "@/lib/feedback/schema";

/**
 * A client wrapper so the render prop never crosses the Server boundary.
 *
 * `RecordForm` takes `fields` as a function, and a plain function CANNOT be
 * passed from a Server Component to a Client Component — only Server Actions
 * can. Rendering `<RecordForm fields={…}>` straight from a page produced a 500
 * on every lookups create and edit route in 2.2b (PROGRESS decision 22) and
 * would do the same here. Between two client components the same prop is
 * ordinary.
 */
export function FeedbackForm({
  action,
  initial,
  initialState,
}: {
  action: (
    prev: ActionState<FeedbackField>,
    formData: FormData,
  ) => Promise<ActionState<FeedbackField>>;
  initial: Values<FeedbackField>;
  initialState?: ActionState<FeedbackField>;
}) {
  return (
    <RecordForm<FeedbackField>
      action={action}
      initial={initial}
      fields={({ values, errors }) => (
        <>
          <ClientContextFields
            defaultFrom={values.from ?? ""}
            defaultViewport={values.viewport ?? ""}
          />
          <FeedbackFields values={values} errors={errors} />
        </>
      )}
      submitLabel="Send report"
      pendingLabel="Sending…"
      cancelHref="/feedback"
      initialState={initialState}
    />
  );
}
