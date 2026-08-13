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
}: {
  idleLabel: string;
  pendingLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  /** For genuinely unavailable actions (e.g. no API key configured). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
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
