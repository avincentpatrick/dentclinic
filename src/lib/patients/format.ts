/** Clinic timezone, from PLAN. Settings-driven from 2.2b; hardcoded until then. */
export const CLINIC_TZ = "Asia/Manila";

/**
 * A `date` column has no time and no zone, so it must NOT be run through a
 * timezone-converting formatter: `new Date("1990-05-04")` is midnight UTC,
 * which is 1990-05-03 in half the world's zones and would show a patient the
 * wrong birthday. Formatting the parts directly sidesteps the whole class.
 */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDob(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = MONTHS[Number(mo) - 1];
  if (!month) return iso;
  return `${Number(d)} ${month} ${y}`;
}

/** Whole years, computed in the clinic's zone rather than the server's. */
export function patientAge(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // en-CA gives yyyy-mm-dd

  const [ty, tm, td] = today.split("-").map(Number);
  const [, by, bm, bd] = m.map(Number) as unknown as number[];

  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** A timestamptz, in the clinic's zone. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
