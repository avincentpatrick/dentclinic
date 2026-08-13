"use client";

import { maskPath } from "@/lib/feedback/path";

/**
 * The two fields only the browser can fill in: which screen the report is
 * about, and how big the window was.
 *
 * NO STATE AND NO EFFECT. The obvious shape — `useEffect` + `setState` — is a
 * cascading render (and eslint's `react-hooks/set-state-in-effect` says so),
 * because nothing about these values needs to participate in rendering. They
 * are two strings that have to be in the FormData when the user presses Send.
 * So they are written straight onto uncontrolled inputs by a ref callback,
 * which runs once on mount, before any submit is possible.
 *
 * `if (!el.value)` matters: after a rejected submit React resets an
 * uncontrolled input to its `defaultValue`, and the ref does not re-run for the
 * same element. The echoed value is already correct in that case, so filling
 * only-when-empty means the first render collects the values and every
 * subsequent one preserves what was collected.
 *
 * Everything here is UNTRUSTED by the server. `fileReport` runs `maskPath` over
 * whatever arrives, so the masking below is for the reporter's benefit — it is
 * what the "this will be tagged /patients/[id]" notice reflects — and not the
 * control. See rule 1 of docs/modules/16-feedback.md.
 */
export function ClientContextFields({
  defaultFrom,
  defaultViewport,
}: {
  defaultFrom?: string;
  defaultViewport?: string;
}) {
  return (
    <>
      <input
        type="hidden"
        name="from"
        defaultValue={defaultFrom ?? ""}
        ref={(el) => {
          if (!el || el.value) return;
          // Falls back to the referrer when the link carried no `?from=`:
          // someone who typed /feedback into the address bar has no originating
          // screen, and a same-origin referrer is the only remaining hint.
          // Cross-origin referrers are ignored outright — another site's path
          // is not one of ours and would mask to null anyway.
          try {
            if (!document.referrer) return;
            const url = new URL(document.referrer);
            if (url.origin !== window.location.origin) return;
            el.value = maskPath(url.pathname) ?? "";
          } catch {
            // A malformed referrer is simply no referrer.
          }
        }}
      />
      <input
        type="hidden"
        name="viewport"
        defaultValue={defaultViewport ?? ""}
        ref={(el) => {
          if (el && !el.value) el.value = `${window.innerWidth}x${window.innerHeight}`;
        }}
      />
    </>
  );
}
