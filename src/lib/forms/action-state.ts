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
 * It rides as the PROCEED BUTTON'S OWN name/value, server-rendered, rather than
 * as client state or a hidden input. A submit button's name/value reaches
 * FormData only when that button is the one that submitted, which is what makes
 * the two submits mean different things: the primary "Create patient" carries no
 * ack and therefore ALWAYS re-runs the check, while only the explicit "Create a
 * separate record" acknowledges anything. A hidden input would be submitted by
 * both and would silently disarm the primary button.
 *
 * `existingHref` and `proceedLabel` are optional because the patient-facing mode
 * must never render either one — a link or a "create anyway" button would both
 * confirm that a record exists. Enumeration-safety is enforced here, in the
 * type, rather than in the component's markup.
 */
export type DuplicateMatch = {
  id: string;
  patientNumber: string;
  fullName: string;
  /** The DB's own words, e.g. "Same email address and date of birth". */
  reason: string;
  confidence: "certain" | "likely" | "possible";
};

export type Confirmable = {
  kind: "duplicate-patient";
  title: string;
  detail: string;
  /** Staff-only. Where to go INSTEAD of proceeding. */
  existingHref?: string;
  /** Staff-only. Absent ⇒ the UI offers no way to proceed. */
  proceedLabel?: string;
  /**
   * Staff-only, same contract as the two above: absent ⇒ nothing is listed.
   *
   * A list rather than a single link because the probe returns up to five and
   * the non-unique `(email, dob)` index exists precisely so twins sharing a
   * parent's email CAN both exist. Collapsing five matches into one link throws
   * away the information the "is this the same person?" decision needs.
   */
  matches?: readonly DuplicateMatch[];
  ack: string;
};

export type ActionState<F extends string = string> =
  | { status: "idle" }
  | { status: "invalid"; formError?: string; fieldErrors: FieldErrors<F>; values: Values<F> }
  | { status: "confirm"; confirm: Confirmable; fieldErrors: FieldErrors<F>; values: Values<F> }
  | { status: "error"; formError: string; values: Values<F> }
  /**
   * `values` is optional here and required on the other non-idle states, and the
   * difference is not cosmetic.
   *
   * **React resets an uncontrolled form to its `defaultValue` attributes when a
   * form action completes.** That is what makes `echo` work at all: the round
   * trip re-renders the inputs with what the user typed, and the reset lands on
   * those values rather than on blanks. It also means a `success` that STAYS ON
   * THE PAGE and carries no values silently empties the form.
   *
   * Measured, not reasoned about: /register's step 1 returned a bare success,
   * React reset every step-1 field, and the final submit posted empty strings —
   * the form reported "First name is required" against inputs the user had
   * filled in and could no longer see.
   *
   * So: omit `values` when the action redirects (nothing is left to re-render),
   * include them whenever the form stays put.
   */
  | { status: "success"; message: string; values?: Values<F> };

export const IDLE = { status: "idle" } as const;

export function errorsOf<F extends string>(state: ActionState<F>): FieldErrors<F> {
  return state.status === "invalid" || state.status === "confirm" ? state.fieldErrors : {};
}

export function valueOf<F extends string>(state: ActionState<F>, field: F, fallback = ""): string {
  // `"values" in state` is not enough since success made it optional: the key
  // can be present and undefined.
  return "values" in state ? (state.values?.[field] ?? fallback) : fallback;
}

/**
 * Whether this state carries echoed values at all.
 *
 * A form needs this to decide between the round trip's values and whatever it
 * was seeded with: after a redirect-less success the state IS authoritative, but
 * a bare success (a create that redirected) has nothing to say.
 */
export function hasValues<F extends string>(state: ActionState<F>): boolean {
  return "values" in state && state.values !== undefined;
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
