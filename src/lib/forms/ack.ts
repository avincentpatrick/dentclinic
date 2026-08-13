const ACK_VERSION = "v1";

/**
 * Unit separator, spelled out rather than typed as a literal control character
 * — an invisible byte in a security-relevant string is how a "harmless
 * whitespace cleanup" quietly changes what gets hashed.
 *
 * It cannot occur in a form value, so no field boundary can be faked by typing
 * the delimiter: without it, an email of `a@b.test` + surname `x` would hash
 * identically to email `a@b.te` + surname `stx`.
 */
const SEP = String.fromCharCode(31);

/**
 * A hash of the exact normalised values a duplicate check ran against — never a
 * boolean "proceed" flag.
 *
 * That difference is the whole design. Editing the email or date of birth after
 * seeing a warning changes the hash, so the ack minted for the old values no
 * longer matches and the check RE-RUNS. A boolean would let someone dismiss a
 * warning about Maria Santos and then submit a record for someone else entirely
 * with the dismissal still attached.
 *
 * Normalisation MIRRORS find_patient_duplicates (0005:278-280) exactly:
 * `lower(btrim(email))`, `lower(btrim(last_name))`, the last 10 digits of the
 * phone. If the two ever drift, an ack minted for one set of values would
 * silence a probe that ran against another — so they are commented on both
 * sides.
 *
 * `excludeId` is in the hash so an ack minted on an edit form (which probes
 * with `p_exclude`) cannot be replayed on a create, where the same values would
 * have matched one more row.
 *
 * DELIBERATELY NOT A MAC. The algorithm is public, so a determined client could
 * compute a valid ack without ever seeing the warning. That is acceptable and
 * worth stating plainly: the ack carries integrity of INTENT, not authorization.
 * Forging one produces a duplicate row — which this schema explicitly tolerates
 * (the `(email, dob)` index is non-unique on purpose) and which the same staff
 * user could produce anyway by pressing the button. An HMAC would buy nothing
 * and would add a required platform secret whose absence is a new way for
 * patient creation to break.
 */
export async function duplicateAck(v: {
  email: string | null;
  dob: string | null;
  lastName: string;
  phone: string | null;
  excludeId: string | null;
}): Promise<string> {
  const canonical = [
    ACK_VERSION,
    (v.email ?? "").trim().toLowerCase(),
    v.dob ?? "",
    v.lastName.trim().toLowerCase(),
    (v.phone ?? "").replace(/\D/g, "").slice(-10),
    v.excludeId ?? "",
  ].join(SEP);

  // Web Crypto, not node:crypto: global on Workers and on Node >= 19, so this
  // needs no import and no nodejs_compat dependency.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
