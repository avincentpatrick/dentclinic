/**
 * The return contract for every mutating server action from Phase 2 on.
 *
 * Phase 1's actions returned `void` (see app/actions/preferences.ts) because
 * they had nothing to say: an appearance toggle either applies or the page was
 * already correct. Real forms need a channel back — which field was wrong, what
 * the user typed, and whether something needs confirming before it proceeds.
 *
 * Shape notes that are load-bearing:
 *
 * - `invalid` and `error` are DELIBERATELY different states. `invalid` is the
 *   user's to fix and renders at the field; `error` is ours to apologise for and
 *   renders at form level. Collapsing them produces the classic "your input was
 *   invalid" banner over a form with no field marked.
 *
 * - `values` is echoed back on every non-success state so a failed submit never
 *   empties the form — the server round trip re-renders the inputs with what
 *   the user typed, including the part that was rejected.
 *
 * - `confirm` is a soft stop: valid input, but something a human should look at
 *   first. It is not an error and must never be styled as one.
 */

export type FieldErrors<F extends string> = Partial<Record<F, string>>;
export type Values<F extends string> = Partial<Record<F, string>>;

/**
 * A non-blocking check the server refuses to bypass silently.
 *
 * `ack` is a hash of the exact normalised values the check was computed for, not
 * a boolean "proceed" flag. That difference is the whole design: editing the
 * email or date of birth after seeing a warning changes the hash, so the echoed
 * ack no longer matches and the check RE-RUNS. A boolean would let a user
 * dismiss a warning about Maria Santos and then submit a record for someone
 * else entirely, with the dismissal still attached.
 *
 * It rides as a server-rendered hidden input rather than client state, so it is
 * submitted by the form itself and cannot drift from what is on screen.
 *
 * `existingHref` and `proceedLabel` are optional because the patient-facing mode
 * must never render either one — a link or a "create anyway" button would both
 * confirm that a record exists. Enumeration-safety is enforced here, in the
 * type, rather than in the component's markup.
 */
export type Confirmable = {
  kind: "duplicate-patient";
  title: string;
  detail: string;
  /** Staff-only. Where to go INSTEAD of proceeding. */
  existingHref?: string;
  /** Staff-only. Absent ⇒ the UI offers no way to proceed. */
  proceedLabel?: string;
  ack: string;
};

export type ActionState<F extends string = string> =
  | { status: "idle" }
  | { status: "invalid"; formError?: string; fieldErrors: FieldErrors<F>; values: Values<F> }
  | { status: "confirm"; confirm: Confirmable; fieldErrors: FieldErrors<F>; values: Values<F> }
  | { status: "error"; formError: string; values: Values<F> }
  | { status: "success"; message: string };

export const IDLE = { status: "idle" } as const;

export function errorsOf<F extends string>(state: ActionState<F>): FieldErrors<F> {
  return state.status === "invalid" || state.status === "confirm" ? state.fieldErrors : {};
}

export function valueOf<F extends string>(state: ActionState<F>, field: F, fallback = ""): string {
  return "values" in state ? (state.values[field] ?? fallback) : fallback;
}

/** The form-level message, if this state has one. Never a field error. */
export function formErrorOf<F extends string>(state: ActionState<F>): string | null {
  if (state.status === "error") return state.formError;
  if (state.status === "invalid") return state.formError ?? null;
  return null;
}

/**
 * The ack a `confirm` state is waiting for, so the form can echo it back as a
 * hidden input rather than hold it in client state — it is then submitted by
 * the form itself and cannot drift from the values on screen.
 *
 * The check it acknowledges is unbypassable regardless: it runs server-side on
 * every submit, and a submit is the only way in.
 */
export function ackOf<F extends string>(state: ActionState<F>): string | null {
  return state.status === "confirm" ? state.confirm.ack : null;
}
