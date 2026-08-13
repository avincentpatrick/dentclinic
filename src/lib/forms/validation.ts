import type { FieldErrors, Values } from "@/lib/forms/action-state";

/**
 * Form validation, hand-rolled.
 *
 * Not zod, and the reason is consistency rather than bundle size (zod would be
 * ~0.4% of the worker budget, which is affordable). `src/lib/appearance.ts`
 * already establishes this codebase's validation idiom — an allow-list in, a
 * typed union out, never a throw — and `normalizeHue` in `branding.ts` is the
 * same shape. A second validation philosophy in one repo is worse than either
 * one alone. zod would also save only the predicate, not the plumbing: every
 * error still has to be mapped into ActionState.fieldErrors, and the predicates
 * here are required/email/date/one-of/int-range.
 *
 * REVISIT AT PHASE 6.1. `medical_history_versions.data` is a nested, versioned,
 * patient-authored jsonb structure — that is where a schema library earns its
 * keep. If it is adopted, keep parseForm's return shape so nothing else changes.
 *
 * Two rules make this safe:
 *   - `oneOf` is the ONLY way a union-typed field enters the system, which is
 *     the same guarantee parseTheme/parseFontPref give.
 *   - No validator ever throws. The discriminated result is the only channel,
 *     so a missing case is a type error rather than a 500.
 */

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };
export type Validator<T> = (raw: string | null) => Ok<T> | Err;

export type Schema<T> = { [K in keyof T]: Validator<T[K]> };

const ok = <T,>(value: T): Ok<T> => ({ ok: true, value });
const err = (error: string): Err => ({ ok: false, error });

/** FormData.get can return a File; a text validator must never see one. */
function str(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}

export function parseForm<T extends Record<string, unknown>>(
  formData: FormData,
  schema: Schema<T>,
): { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors<keyof T & string> } {
  const value = {} as T;
  const fieldErrors: Record<string, string> = {};

  for (const key of Object.keys(schema) as (keyof T & string)[]) {
    const result = schema[key](str(formData.get(key)));
    if (result.ok) value[key] = result.value;
    else fieldErrors[key] = result.error;
  }

  return Object.keys(fieldErrors).length
    ? { ok: false, fieldErrors: fieldErrors as FieldErrors<keyof T & string> }
    : { ok: true, value };
}

/**
 * Echo the submitted strings back so a failed submit never empties the form.
 * Raw, not parsed: the user must see what they typed, including the part that
 * was rejected, or they cannot tell what to fix.
 */
export function echo<F extends string>(formData: FormData, fields: readonly F[]): Values<F> {
  const out: Record<string, string> = {};
  for (const field of fields) out[field] = str(formData.get(field)) ?? "";
  return out as Values<F>;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function required(label: string, max = 200): Validator<string> {
  return (raw) => {
    const v = (raw ?? "").trim();
    if (!v) return err(`${label} is required.`);
    if (v.length > max) return err(`${label} must be ${max} characters or fewer.`);
    return ok(v);
  };
}

export function optional(max = 200): Validator<string | null> {
  return (raw) => {
    const v = (raw ?? "").trim();
    if (!v) return ok(null);
    if (v.length > max) return err(`Must be ${max} characters or fewer.`);
    return ok(v);
  };
}

/**
 * Deliberately permissive: one @, something either side, a dot in the domain.
 * Stricter regexes reject valid addresses, and the only real proof that an
 * address works is mail arriving at it — which is what the OTP flow already
 * does. Lowercased because `patients.email` is citext and the dedupe check
 * compares normalised values.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const email: Validator<string> = (raw) => {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return err("Email is required.");
  if (v.length > 254) return err("That email address is too long.");
  if (!EMAIL_RE.test(v)) return err("Enter an email address like name@example.com.");
  return ok(v);
};

export const emailOptional: Validator<string | null> = (raw) => {
  const v = (raw ?? "").trim();
  if (!v) return ok(null);
  const result = email(v);
  return result.ok ? ok(result.value) : result;
};

/**
 * `<input type="date">` submits ISO yyyy-mm-dd, so the format check is cheap —
 * but it must still be checked, because a form can be POSTed without a browser.
 *
 * `notFuture` allows TOMORROW, not today. The clinic is UTC+8 and the server is
 * UTC, so "today" in Manila is already tomorrow by server reckoning for eight
 * hours of every working day. Same reasoning as the patients_dob_sane
 * constraint in migration 0006 — the two must agree or the DB rejects what the
 * form accepted.
 */
export function isoDate(opts: {
  label: string;
  notFuture?: boolean;
  minYear?: number;
  required?: boolean;
}): Validator<string | null> {
  return (raw) => {
    const v = (raw ?? "").trim();
    if (!v) return opts.required === false ? ok(null) : err(`${opts.label} is required.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return err(`Enter ${opts.label.toLowerCase()} as a date.`);

    const parsed = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return err(`That is not a real date.`);
    // Round-trip guard: Date accepts 2026-02-31 and silently rolls it forward.
    if (parsed.toISOString().slice(0, 10) !== v) return err(`That is not a real date.`);

    if (opts.minYear && parsed.getUTCFullYear() < opts.minYear) {
      return err(`${opts.label} must be after ${opts.minYear}.`);
    }
    if (opts.notFuture) {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      if (v > tomorrow) return err(`${opts.label} cannot be in the future.`);
    }
    return ok(v);
  };
}

/**
 * Philippine-tolerant and deliberately loose: +63 917 123 4567, 0917-123-4567
 * and 09171234567 are all the same number, and a clinic will be handed all
 * three. Stored as typed; `patients.phone_norm` does the comparing.
 */
export const phone: Validator<string | null> = (raw) => {
  const v = (raw ?? "").trim();
  if (!v) return ok(null);
  if (!/^[0-9+()\-.\s]+$/.test(v)) return err("Use digits, spaces, +, - or ( ) only.");
  const digits = v.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return err("Enter a phone number with 7 to 15 digits.");
  return ok(v);
};

/**
 * The ONLY way a union-typed field enters the system. Everything with a fixed
 * vocabulary — enums, sort keys, category filters — goes through here, so an
 * unexpected value is a rejection rather than a database error.
 */
export function oneOf<T extends string>(values: readonly T[], label: string): Validator<T> {
  return (raw) => {
    const v = (raw ?? "").trim();
    if (values.includes(v as T)) return ok(v as T);
    return err(`Choose a valid ${label.toLowerCase()}.`);
  };
}

/** Unchecked boxes are absent from FormData entirely — absence is `false`. */
export const checkbox: Validator<boolean> = (raw) => ok(raw === "on" || raw === "true");

export function intInRange(min: number, max: number, label: string): Validator<number> {
  return (raw) => {
    const v = (raw ?? "").trim();
    if (!v) return err(`${label} is required.`);
    if (!/^-?\d+$/.test(v)) return err(`${label} must be a whole number.`);
    const n = Number(v);
    if (n < min || n > max) return err(`${label} must be between ${min} and ${max}.`);
    return ok(n);
  };
}

/**
 * Minutes in, 10-minute UNITS out.
 *
 * The database stores counts of 10-minute increments (AGENTS.md); clinicians
 * think in minutes. **This is the only place in the system where the two meet,
 * and nothing else multiplies or divides by 10.**
 *
 * NON-MULTIPLES ARE REJECTED, NEVER ROUNDED. Silently turning 45 into 50 leaves
 * a clinic with a schedule five minutes wrong on every appointment of that type
 * and nothing to tell them — the same reasoning that makes the duplicate-patient
 * check a warning rather than a silent merge. The message names the two nearest
 * valid values rather than saying "must be a multiple of 10", because the user
 * should not have to do the arithmetic to find out what to type.
 *
 * Bounds are in UNITS and must mirror the CHECK constraints in migration 0012
 * exactly: when a form and its table disagree, the database rejects what the
 * form accepted and the error has no field to attach itself to.
 */
export function tenMinuteUnits(opts: {
  label: string;
  minUnits: number;
  maxUnits: number;
  required?: boolean;
}): Validator<number> {
  return (raw) => {
    const v = (raw ?? "").trim();
    if (!v) {
      return opts.required === false ? ok(0) : err(`${opts.label} is required.`);
    }
    if (!/^\d+$/.test(v)) return err(`${opts.label} must be a whole number of minutes.`);

    const minutes = Number(v);
    if (minutes % 10 !== 0) {
      const low = Math.floor(minutes / 10) * 10;
      const high = low + 10;
      return err(
        low === 0
          ? `${opts.label} must be in 10-minute steps — try ${high}.`
          : `${opts.label} must be in 10-minute steps — try ${low} or ${high}.`,
      );
    }

    const units = minutes / 10;
    if (units < opts.minUnits || units > opts.maxUnits) {
      return err(
        `${opts.label} must be between ${opts.minUnits * 10} and ${opts.maxUnits * 10} minutes.`,
      );
    }
    return ok(units);
  };
}

/**
 * A money amount, as a number.
 *
 * Regex-first and never `parseFloat` on arbitrary input: `parseFloat("12abc")`
 * is 12 and `parseFloat("1,500")` is 1, both silently. A price that quietly
 * becomes a different price is a billing defect, so anything that is not plainly
 * a decimal is refused.
 *
 * Two decimal places, matching `numeric(12,2)` in migration 0013 — a third would
 * be rounded by the database, which is a value the user did not type.
 */
export function money(opts: {
  label: string;
  max?: number;
  required?: boolean;
}): Validator<number | null> {
  const max = opts.max ?? 9_999_999_999.99;
  return (raw) => {
    const v = (raw ?? "").trim().replace(/^[₱$]/, "").trim();
    if (!v) return opts.required === false ? ok(null) : err(`${opts.label} is required.`);
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) {
      return err(`${opts.label} must be an amount like 1500 or 1500.50.`);
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return err(`${opts.label} cannot be negative.`);
    if (n > max) return err(`${opts.label} is too large.`);
    return ok(n);
  };
}

/**
 * A URL that will be rendered in an `<img src>`.
 *
 * `https:` ONLY, deliberately not the obvious `https?:`. The app is served over
 * https, so an http image is blocked as mixed content — it would be a value
 * that stores cleanly, passes every check, and then silently never renders.
 * The form is the only place the user can be told why, so it is rejected here.
 *
 * Parsed with the URL constructor rather than a regex: a regex permissive
 * enough to accept real URLs also accepts shapes browsers normalise
 * differently, and `javascript:alert(1)` is exactly the kind of thing that
 * slips through a loose one. `new URL` throws on garbage, so the call is
 * wrapped — no validator in this module may ever throw.
 */
export function httpsUrl(opts: {
  label: string;
  max?: number;
  required?: boolean;
}): Validator<string | null> {
  const max = opts.max ?? 500;
  return (raw) => {
    const v = (raw ?? "").trim();
    if (!v) return opts.required ? err(`${opts.label} is required.`) : ok(null);
    if (v.length > max) return err(`${opts.label} must be ${max} characters or fewer.`);

    let parsed: URL;
    try {
      parsed = new URL(v);
    } catch {
      return err("Enter a full web address, starting with https://");
    }
    if (parsed.protocol !== "https:") {
      return err("The address must start with https:// — an http image will not load.");
    }
    return ok(parsed.toString());
  };
}
