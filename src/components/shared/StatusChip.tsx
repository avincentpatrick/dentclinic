import { cva, type VariantProps } from "class-variance-authority";
import {
  Archive,
  Armchair,
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ShieldCheck,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusKey =
  | "scheduled"
  | "confirmed"
  | "in-chair"
  | "completed"
  | "no-show"
  | "cancelled";

export type ClinicalLevel = "healthy" | "watch" | "urgent";

export const STATUS_KEYS: readonly StatusKey[] = [
  "scheduled",
  "confirmed",
  "in-chair",
  "completed",
  "no-show",
  "cancelled",
] as const;

export const CLINICAL_LEVELS: readonly ClinicalLevel[] = ["healthy", "watch", "urgent"] as const;

/**
 * Label + icon are DERIVED from the status — there is deliberately no `label`,
 * `children`, or `color` prop. That makes a colour-only chip, or one whose text
 * disagrees with its colour, unrepresentable in the type system. Stronger than
 * a lint rule and stronger than a doc.
 */
type StatusMeta = { label: string; Icon: LucideIcon; bg: string; fg: string; ring: string };

const STATUS_META: Record<StatusKey, StatusMeta> = {
  scheduled: {
    label: "Scheduled",
    Icon: CalendarClock,
    bg: "bg-status-scheduled-soft",
    fg: "text-status-scheduled-on-soft",
    ring: "ring-status-scheduled/25",
  },
  confirmed: {
    label: "Confirmed",
    Icon: CalendarCheck2,
    bg: "bg-status-confirmed-soft",
    fg: "text-status-confirmed-on-soft",
    ring: "ring-status-confirmed/25",
  },
  "in-chair": {
    label: "In chair",
    Icon: Armchair,
    bg: "bg-status-in-chair-soft",
    fg: "text-status-in-chair-on-soft",
    ring: "ring-status-in-chair/25",
  },
  completed: {
    label: "Completed",
    Icon: CircleCheck,
    bg: "bg-status-completed-soft",
    fg: "text-status-completed-on-soft",
    ring: "ring-status-completed/25",
  },
  "no-show": {
    label: "No-show",
    Icon: UserX,
    bg: "bg-status-no-show-soft",
    fg: "text-status-no-show-on-soft",
    ring: "ring-status-no-show/25",
  },
  cancelled: {
    label: "Cancelled",
    Icon: CalendarX2,
    bg: "bg-status-cancelled-soft",
    fg: "text-status-cancelled-on-soft",
    ring: "ring-status-cancelled/25",
  },
};

const CLINICAL_META: Record<ClinicalLevel, StatusMeta> = {
  healthy: {
    label: "Healthy",
    Icon: ShieldCheck,
    bg: "bg-clinical-healthy-soft",
    fg: "text-clinical-healthy-on-soft",
    ring: "ring-clinical-healthy/25",
  },
  watch: {
    label: "Watch",
    Icon: CircleAlert,
    bg: "bg-clinical-watch-soft",
    fg: "text-clinical-watch-on-soft",
    ring: "ring-clinical-watch/25",
  },
  urgent: {
    label: "Urgent",
    Icon: TriangleAlert,
    bg: "bg-clinical-urgent-soft",
    fg: "text-clinical-urgent-on-soft",
    ring: "ring-clinical-urgent/25",
  },
};

const chip = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
  {
    variants: {
      size: {
        sm: "h-6 px-2 text-xs [&>svg]:size-3.5",
        md: "h-7 px-2.5 text-sm [&>svg]:size-4",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type ChipSize = VariantProps<typeof chip>["size"];

function Chip({ meta, size, className }: { meta: StatusMeta; size?: ChipSize; className?: string }) {
  const { label, Icon, bg, fg, ring } = meta;
  return (
    <span className={cn(chip({ size }), bg, fg, ring, className)}>
      {/* aria-hidden: the visible label already carries the meaning, so an
          accessible name here would double-announce. */}
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

/** Appointment status. Always chip + label + icon — never colour alone. */
export function StatusChip({
  status,
  size,
  className,
}: {
  status: StatusKey;
  size?: ChipSize;
  className?: string;
}) {
  return <Chip meta={STATUS_META[status]} size={size} className={className} />;
}

/** Clinical severity. Same contract as StatusChip; separate type so the two
 *  vocabularies can never be passed to each other. */
export function ClinicalChip({
  level,
  size,
  className,
}: {
  level: ClinicalLevel;
  size?: ChipSize;
  className?: string;
}) {
  return <Chip meta={CLINICAL_META[level]} size={size} className={className} />;
}

/**
 * Record lifecycle, NOT appointment status.
 *
 * A separate vocabulary rather than two more `StatusKey` values, for the same
 * reason `ClinicalLevel` is separate: `STATUS_KEYS` drives the gallery loops and
 * the a11y matrix and means "what is happening with this visit". "Archived" is
 * a property of the row, and mixing the two would let `<StatusChip
 * status="archived" />` render on a calendar cell.
 *
 * Neutral tokens on purpose. Archiving is reversible and routine — soft-delete
 * has no colour of alarm to it, and `--destructive` next to a patient's name
 * would misread as something being wrong with the patient.
 */
export type RecordState = "archived" | "provisional";

export const RECORD_STATES: readonly RecordState[] = ["archived", "provisional"] as const;

const RECORD_META: Record<RecordState, StatusMeta> = {
  archived: {
    label: "Archived",
    Icon: Archive,
    bg: "bg-muted",
    fg: "text-muted-foreground",
    ring: "ring-border",
  },
  provisional: {
    label: "Provisional",
    Icon: CircleDashed,
    bg: "bg-muted",
    fg: "text-muted-foreground",
    ring: "ring-border",
  },
};

/** Row lifecycle. Same chip + label + icon contract as StatusChip. */
export function RecordChip({
  state,
  size,
  className,
}: {
  state: RecordState;
  size?: ChipSize;
  className?: string;
}) {
  return <Chip meta={RECORD_META[state]} size={size} className={className} />;
}

export function statusLabel(status: StatusKey): string {
  return STATUS_META[status].label;
}

export function recordLabel(state: RecordState): string {
  return RECORD_META[state].label;
}

export function clinicalLabel(level: ClinicalLevel): string {
  return CLINICAL_META[level].label;
}
