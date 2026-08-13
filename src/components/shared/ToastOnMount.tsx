"use client";

import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { restorePatientById } from "@/app/actions/patients";

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
 */
export function ToastOnMount({
  token,
  title,
  description,
  actionLabel,
  undoPatientId,
  clearParam = "undo",
}: {
  token: string;
  title: string;
  description?: string;
  actionLabel?: string;
  /** Present ⇒ the toast offers Undo, which restores this patient. */
  undoPatientId?: string;
  clearParam?: string;
}) {
  const [, startTransition] = useTransition();

  useEffect(() => {
    toast(title, {
      id: token,
      description,
      action:
        undoPatientId && actionLabel
          ? {
              label: actionLabel,
              onClick: () => {
                startTransition(async () => {
                  await restorePatientById(undoPatientId);
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
