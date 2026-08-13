/**
 * Display helpers for the lookups screens.
 *
 * Separate from `query.ts` because these are about what a person reads, not
 * about what reaches the database — and only this file and the `tenMinuteUnits`
 * validator are allowed to know that a unit is ten minutes.
 */

/** `5` → `"50 min"`, `9` → `"1 h 30 min"`. */
export function formatMinutes(units: number): string {
  const minutes = units * 10;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * The whole block a booking actually consumes.
 *
 * This is the number the lookups table exists to surface: buffers are invisible
 * everywhere else — they never appear on a patient's confirmation and are not
 * part of the duration — so the only way a clinic notices that "Emergency, 30
 * min" occupies 40 minutes of a chair is if something says so.
 */
export function totalBlockMinutes(t: {
  duration_units: number;
  pre_buffer_units: number;
  post_buffer_units: number;
}): number {
  return (t.pre_buffer_units + t.duration_units + t.post_buffer_units) * 10;
}

export function hasBuffers(t: { pre_buffer_units: number; post_buffer_units: number }): boolean {
  return t.pre_buffer_units > 0 || t.post_buffer_units > 0;
}

/** `+0 / +10` — pre and post, in minutes, in the order they surround the visit. */
export function formatBuffers(t: { pre_buffer_units: number; post_buffer_units: number }): string {
  return `+${t.pre_buffer_units * 10} / +${t.post_buffer_units * 10}`;
}

/**
 * Money, in the clinic's currency.
 *
 * The currency is a `private.settings` key rather than a column, because there
 * is one clinic per install — an amount with no currency is not money, but a
 * per-row currency would imply the clinic bills in several.
 */
export function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An unknown currency code must not blank out a price list.
    return `${currency} ${amount.toFixed(2)}`;
  }
}
