"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The submit button for a server-action form, and the ONLY client component a
 * Phase 2 form needs.
 *
 * `useFormStatus` reads the pending state of the nearest enclosing <form>, so
 * this must be rendered INSIDE the form rather than by whatever renders it —
 * that is the usual mistake, and it fails silently by simply never going
 * pending.
 *
 * Disabling while pending is not cosmetic — 00-principles.md forbids optimistic
 * UI for booking and clinical writes, which makes double-submit a real hazard:
 * two POSTs of a patient create are two patients.
 *
 * NOTE ON NO-JS: this button is inside a useActionState form, and those do not
 * submit without JavaScript at all — React emits `$ACTION_REF_n`, a reference
 * resolved from the client module map, rather than a self-contained
 * `$ACTION_ID_*`. Measured on a production build; see
 * docs/design-system/05-patterns/forms.md. So this is not "enhancement over a
 * working baseline" — there is no no-JS baseline for these forms, by design.
 * Plain void-returning actions (sign-out, savePreferences) are unaffected and
 * keep their <noscript> paths.
 */
export function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
  className,
  disabled,
  name,
  value,
  formAction,
}: {
  idleLabel: string;
  pendingLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  /** For genuinely unavailable actions (e.g. no API key configured). */
  disabled?: boolean;
  /**
   * Submitter-scoped form data. A submit button's name/value reaches FormData
   * ONLY when that button is the one that submitted — which is the entire
   * mechanism behind the duplicate-warning ack (05-patterns/forms.md).
   *
   * A hidden input cannot do this job: it is submitted by every button in the
   * form, so the primary "Create patient" would carry the ack too and silently
   * skip the check it is supposed to re-run. Carrying it here means the primary
   * button never acknowledges anything, and only the explicit "Create a
   * separate record" does.
   */
  name?: string;
  value?: string;
  /**
   * Overrides the enclosing form's action for THIS button only.
   *
   * How a multi-step form posts per step without a second <form>: each step's
   * button carries its own `useActionState` action, and every button sees the
   * whole FormData, so fields from an earlier step ride along as the very
   * inputs the user typed into. See RegisterForm.
   */
  formAction?: (formData: FormData) => void;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      variant={variant}
      disabled={pending || disabled}
      aria-busy={pending}
      className={cn("min-h-11", className)}
    >
      {pending && (
        // motion-reduce:animate-none leaves a static glyph, which is fine: the
        // label swap and aria-busy carry the meaning without it.
        <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      )}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
