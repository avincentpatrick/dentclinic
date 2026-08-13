"use client";

import { useEffect, useTransition } from "react";
import { toast } from "sonner";

/**
 * The Server-Component → toast handshake.
 *
 * A Server Action cannot call `toast()` — the toast lives in the browser and the
 * action has already finished by the time anything renders. So the chain is:
 * the action redirects with a one-shot search param, the Server Component reads
 * it and renders this, and this fires the toast on mount.
 *
 * `token` is what makes it one-shot in both directions: it is sonner's toast
 * `id`, so React StrictMode's double-invoke and any re-render de-duplicate
 * instead of stacking two toasts, and it is also the effect's dependency.
 *
 * UNDO IS A BOUND SERVER ACTION PROP, not a patient id.
 *
 * Until 2.2d this component imported `restorePatientById` directly and took an
 * `undoPatientId`, which made the app's one generic toast surface silently
 * patients-only — the feedback queue needed the identical archive-with-undo and
 * could not have it. A Server Action is the ONE kind of function that may cross
 * the Server→Client boundary (PROGRESS decision 22 is the other half of that
 * rule), so the caller binds its own and this stays ignorant of what is being
 * restored.
 */
export function ToastOnMount({
  token,
  title,
  description,
  actionLabel,
  onUndo,
  clearParam = "undo",
}: {
  token: string;
  title: string;
  description?: string;
  actionLabel?: string;
  /**
   * Present ⇒ the toast offers Undo. Must be a Server Action already bound to
   * whatever it restores, e.g. `restoreReportById.bind(null, id)`.
   */
  onUndo?: () => Promise<void>;
  clearParam?: string;
}) {
  const [, startTransition] = useTransition();

  useEffect(() => {
    toast(title, {
      id: token,
      description,
      action:
        onUndo && actionLabel
          ? {
              label: actionLabel,
              onClick: () => {
                startTransition(async () => {
                  await onUndo();
                });
              },
            }
          : undefined,
    });

    // Strip the param WITHOUT a navigation. router.replace() would refetch this
    // dynamic route — a second full RSC render of the roster — and could swap
    // the tree out from under the open toast. history.replaceState just edits
    // the URL, so a refresh or a back-navigation does not re-toast.
    const url = new URL(window.location.href);
    if (url.searchParams.has(clearParam)) {
      url.searchParams.delete(clearParam);
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
    // Intentionally keyed on `token` alone: the copy never changes for a given
    // token, and including it would re-fire on an unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}
