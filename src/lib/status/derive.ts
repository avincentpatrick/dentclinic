import type { ClinicalLevel, StatusKey } from "@/components/shared/StatusChip";

/**
 * DB enums -> presentation status. SEAM ONLY — implemented in Phase 3, when the
 * real `appointments` row shape exists.
 *
 * The mapping is NOT 1:1 and that is the whole reason this file exists:
 *
 *   appt_status   scheduled | complete | broken | unscheduled | planned | asap
 *   visit_status  none | arrived | in_chair | done
 *   confirm_status (separate)
 *
 *   StatusKey     scheduled | confirmed | in-chair | completed | no-show | cancelled
 *
 * `cancelled` and `no-show` are BOTH `appt_status = 'broken'`, distinguished by
 * cancel reason. `in-chair` comes from visit_status, not appt_status.
 * `confirmed` comes from confirm_status. Without one owned mapper every call
 * site would improvise its own — which is how a no-show silently starts
 * rendering as a cancellation.
 *
 * See docs/design-system/04-components/status-chip.md.
 */

export type AppointmentStatusInput = {
  status: "scheduled" | "complete" | "broken" | "unscheduled" | "planned" | "asap";
  visitStatus: "none" | "arrived" | "in_chair" | "done";
  confirmed: boolean;
  /** Distinguishes no-show from a genuine cancellation within `broken`. */
  cancelReasonKey: string | null;
};

export function deriveStatus(_input: AppointmentStatusInput): StatusKey {
  throw new Error(
    "deriveStatus() is a Phase 3 seam — implement it with the appointments table, " +
      "do not inline status mapping at call sites.",
  );
}

export type ClinicalLevelInput = {
  hasUrgentAlert: boolean;
  hasWatchAlert: boolean;
};

export function deriveClinicalLevel(_input: ClinicalLevelInput): ClinicalLevel {
  throw new Error("deriveClinicalLevel() is a Phase 6 seam — implement it with medical_history_versions.");
}
