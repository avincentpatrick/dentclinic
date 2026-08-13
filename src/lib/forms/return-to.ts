/**
 * Re-validate a caller-supplied redirect target.
 *
 * `returnTo` comes from the caller, so it is re-validated even though Next
 * encrypts and signs bound action arguments. These are the only redirect targets
 * in the app that are not literals, and **`//evil.example` is a protocol-relative
 * URL that a naive `startsWith("/")` check waves straight through**.
 *
 * Extracted from `src/app/actions/patients.ts` in Phase 2.2b, when the lookups
 * archive/restore actions needed the same thing. That reasoning must exist in
 * exactly one place: two copies drift, and the copy that drifts is an open
 * redirect.
 *
 * `allowedPrefix` scopes each caller to its own section, so a `/patients` action
 * cannot be talked into redirecting into `/admin` and vice versa.
 */
export function safeReturn(
  returnTo: string,
  allowedPrefix: string,
  extra: Record<string, string> = {},
): string {
  const base =
    returnTo.startsWith(allowedPrefix) && !returnTo.startsWith("//") ? returnTo : allowedPrefix;
  const [path, qs = ""] = base.split("?");
  const params = new URLSearchParams(qs);
  // Never carry a previous undo token forward — the toast it belongs to has
  // already been shown, and re-offering it would undo the wrong row.
  params.delete("undo");
  for (const [k, val] of Object.entries(extra)) params.set(k, val);
  const out = params.toString();
  return out ? `${path}?${out}` : path;
}
