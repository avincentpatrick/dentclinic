import { Field } from "@/components/shared/Field";
import {
  BODY_MAX,
  KIND_OPTIONS,
  SEVERITY_OPTIONS,
  TITLE_MAX,
  type FeedbackField,
} from "@/lib/feedback/schema";
import type { FieldErrors, Values } from "@/lib/forms/action-state";

/**
 * The controls on the "report a problem" form.
 *
 * Props-only and JSX-only, with no form and no action of its own, so the same
 * markup can be rendered by the real page and by a gallery specimen — which is
 * what makes the `layouts` axe coverage worth anything.
 *
 * The two auto-captured fields (`from` and `viewport`) live in
 * `ClientContextFields`, not here: only the browser can fill them, and keeping
 * them out means this file stays renderable from a Server Component.
 */
export function FeedbackFields({
  values,
  errors,
}: {
  values: Values<FeedbackField>;
  errors: FieldErrors<FeedbackField>;
}) {
  const v = (f: FeedbackField) => values[f] ?? "";

  return (
    <>
      <fieldset className="flex flex-col gap-6">
        <legend className="sr-only">About the problem</legend>

        <Field
          as="select"
          name="kind"
          label="What kind of report is this?"
          required
          defaultValue={v("kind") || "bug"}
          options={KIND_OPTIONS}
          error={errors.kind}
        />

        <Field
          as="select"
          name="severity"
          label="How much is it affecting you?"
          required
          defaultValue={v("severity") || "minor"}
          options={SEVERITY_OPTIONS}
          hint="Your best guess is fine. It can be changed later."
          error={errors.severity}
        />

        <Field
          name="title"
          label="A short summary"
          required
          defaultValue={v("title")}
          placeholder="Saving a new patient does nothing"
          hint={`Up to ${TITLE_MAX} characters.`}
          error={errors.title}
        />

        <Field
          as="textarea"
          name="body"
          label="What happened?"
          required
          rows={7}
          defaultValue={v("body")}
          // RULE 3 of the module doc, verbatim in intent. It exists because
          // rule 2 assumes it will sometimes be ignored: the narrow audit
          // trigger never copies this text anywhere, precisely because people
          // paste patient details into free text no matter what the hint says.
          hint="Describe what happened. Don't include patient names or details — reference the appointment time instead."
          error={errors.body}
        />
        <p className="text-sm text-muted-foreground">
          The screen you came from, your browser and your screen size are attached automatically,
          so you don&apos;t have to describe them. Up to {BODY_MAX.toLocaleString()} characters.
        </p>
      </fieldset>
    </>
  );
}
