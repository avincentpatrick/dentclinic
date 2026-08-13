import {
  checkbox,
  intInRange,
  money,
  optional,
  oneOf,
  required,
  tenMinuteUnits,
  type Schema,
} from "@/lib/forms/validation";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Field lists and validators for the lookups forms.
 *
 * Server-free, like `src/lib/patients/schema.ts` and for the same reason: a
 * `"use server"` module may export only async functions, so the tuples and
 * schemas cannot live beside the actions that use them.
 *
 * Bounds mirror migration 0012's CHECK constraints exactly. When a form and its
 * table disagree, the database rejects what the form accepted and the resulting
 * error has no field to attach itself to (forms.md).
 */

export type AppointmentColor = Database["public"]["Enums"]["appointment_color"];
export type LookupValueKind = Database["public"]["Enums"]["lookup_value_kind"];

/**
 * `satisfies` rather than a bare literal, so a colour added to the enum in a
 * migration but not here — or removed from the enum while still listed — is a
 * type error rather than a runtime surprise. Same guard `SEX_VALUES` uses.
 */
export const APPOINTMENT_COLORS = [
  "teal",
  "indigo",
  "violet",
  "sky",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const satisfies readonly AppointmentColor[];

export const COLOR_OPTIONS = APPOINTMENT_COLORS.map((value) => ({
  value,
  // Capitalised English colour names, so the select reads as words. The colour
  // itself is not shown — no tokens exist for these until Phase 3.2, and a
  // swatch alone would be colour-as-only-signal anyway.
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

// Units, matching appointment_types_duration_sane / _buffer_sane in 0012.
export const DURATION_MIN_UNITS = 1;
export const DURATION_MAX_UNITS = 48;
export const BUFFER_MIN_UNITS = 0;
export const BUFFER_MAX_UNITS = 6;
export const SORT_ORDER_MIN = 0;
export const SORT_ORDER_MAX = 9999;

// ---------------------------------------------------------------- appointment types

export const APPOINTMENT_TYPE_FIELDS = [
  "name",
  "description",
  "duration_minutes",
  "pre_buffer_minutes",
  "post_buffer_minutes",
  "patient_bookable",
  "color",
  "sort_order",
] as const;
export type AppointmentTypeField = (typeof APPOINTMENT_TYPE_FIELDS)[number];

/**
 * Note the field names: `*_minutes` in, `*_units` out. The form is honest about
 * what is in the box and `tenMinuteUnits` is the only converter in the system.
 */
export type AppointmentTypeInput = {
  name: string;
  description: string | null;
  duration_minutes: number;
  pre_buffer_minutes: number;
  post_buffer_minutes: number;
  patient_bookable: boolean;
  color: AppointmentColor;
  sort_order: number;
};

export const appointmentTypeSchema: Schema<AppointmentTypeInput> = {
  name: required("Name", 80),
  description: optional(300),
  duration_minutes: tenMinuteUnits({
    label: "Duration",
    minUnits: DURATION_MIN_UNITS,
    maxUnits: DURATION_MAX_UNITS,
  }),
  pre_buffer_minutes: tenMinuteUnits({
    label: "Set-up buffer",
    minUnits: BUFFER_MIN_UNITS,
    maxUnits: BUFFER_MAX_UNITS,
    required: false,
  }),
  post_buffer_minutes: tenMinuteUnits({
    label: "Turnover buffer",
    minUnits: BUFFER_MIN_UNITS,
    maxUnits: BUFFER_MAX_UNITS,
    required: false,
  }),
  patient_bookable: checkbox,
  color: oneOf(APPOINTMENT_COLORS, "colour"),
  sort_order: intInRange(SORT_ORDER_MIN, SORT_ORDER_MAX, "Order"),
};

// --------------------------------------------------------------------- operatories

export const OPERATORY_FIELDS = [
  "name",
  "sort_order",
  "is_hygiene",
  "default_provider_id",
] as const;
export type OperatoryField = (typeof OPERATORY_FIELDS)[number];

export type OperatoryInput = {
  name: string;
  sort_order: number;
  is_hygiene: boolean;
  default_provider_id: string | null;
};

/**
 * `default_provider_id` is validated as an optional uuid rather than through
 * `oneOf` against the live provider list: the select is rendered only when
 * providers exist, and an unknown id is caught by the FK as a 23503 rather than
 * being silently dropped.
 */
const uuidOrNull: Schema<OperatoryInput>["default_provider_id"] = (raw) => {
  const v = (raw ?? "").trim();
  if (!v) return { ok: true, value: null };
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? { ok: true, value: v }
    : { ok: false, error: "Choose a provider from the list." };
};

export const operatorySchema: Schema<OperatoryInput> = {
  name: required("Name", 60),
  sort_order: intInRange(SORT_ORDER_MIN, SORT_ORDER_MAX, "Order"),
  is_hygiene: checkbox,
  default_provider_id: uuidOrNull,
};

// ------------------------------------------------------------------ lookup values

export const LOOKUP_VALUE_FIELDS = ["label", "code", "amount", "sort_order"] as const;
export type LookupValueField = (typeof LOOKUP_VALUE_FIELDS)[number];

export type LookupValueInput = {
  label: string;
  code: string | null;
  amount: number | null;
  sort_order: number;
};

/**
 * Built per category, because `amount` is required for a `money` category and
 * forbidden for a `label` one — `lookup_values_guard` raises on either mistake,
 * and the form should say so before the database has to.
 */
export function lookupValueSchema(kind: LookupValueKind): Schema<LookupValueInput> {
  return {
    label: required("Label", 80),
    code: (raw) => {
      const v = (raw ?? "").trim();
      if (!v) return { ok: true, value: null };
      return /^[A-Za-z0-9_.-]{1,40}$/.test(v)
        ? { ok: true, value: v }
        : { ok: false, error: "Use letters, numbers, dot, dash or underscore only." };
    },
    amount: money({ label: "Amount", required: kind === "money" }),
    sort_order: intInRange(SORT_ORDER_MIN, SORT_ORDER_MAX, "Order"),
  };
}
