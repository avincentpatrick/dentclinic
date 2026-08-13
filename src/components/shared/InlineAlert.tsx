import { cva, type VariantProps } from "class-variance-authority";
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A message bound to the thing on screen — the counterpart to a toast.
 *
 * The rule (docs/design-system/05-patterns/forms.md): inline whenever the
 * message requires a decision or a correction, is tied to a region, must
 * persist while the user works, or is the direct result of what they just did.
 * Toast only for "it worked, and you cannot see that it worked from here".
 *
 * Like StatusChip, the icon is DERIVED from the tone rather than accepted as a
 * prop, so an alert whose icon disagrees with its colour is unrepresentable.
 * There is no `danger` styling shortcut for warnings: `--destructive` is
 * reserved for destructive actions, per the rule EmptyState's docs call binding
 * — red next to a patient's name reads as the patient being in trouble.
 */
export type AlertTone = "info" | "warning" | "success" | "danger";

type ToneMeta = {
  Icon: LucideIcon;
  /** Announced how? Set by meaning, not by colour. */
  role?: "alert" | "status";
};

const TONE_META: Record<AlertTone, ToneMeta> = {
  // Ambient context. Not an event, so nothing is announced.
  info: { Icon: Info },
  // Needs a decision. Announced.
  warning: { Icon: TriangleAlert, role: "alert" },
  // Follows a user action. Announced politely.
  success: { Icon: CircleCheck, role: "status" },
  // Something failed or will destroy data. Announced.
  danger: { Icon: CircleAlert, role: "alert" },
};

const alert = cva("flex gap-3 rounded-lg p-4 text-sm ring-1 ring-inset", {
  variants: {
    tone: {
      info: "bg-info-soft text-info-on-soft ring-info/20",
      warning: "bg-warning-soft text-warning-on-soft ring-warning/25",
      success: "bg-success-soft text-success-on-soft ring-success/20",
      danger: "bg-destructive-soft text-destructive-on-soft ring-destructive/25",
    },
  },
  defaultVariants: { tone: "info" },
});

export type InlineAlertProps = {
  tone: AlertTone;
  title: string;
  /** Supporting detail and any actions. Keep actions inside so they inherit the tone. */
  children?: React.ReactNode;
  className?: string;
} & Omit<VariantProps<typeof alert>, "tone">;

export function InlineAlert({ tone, title, children, className }: InlineAlertProps) {
  const { Icon, role } = TONE_META[tone];

  return (
    <div role={role} className={cn(alert({ tone }), className)}>
      {/* aria-hidden: the tone is already carried by the wrapper's role and by
          the words. Announcing the icon too would double up. */}
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-1 [&_p]:mt-1">{children}</div>}
      </div>
    </div>
  );
}
