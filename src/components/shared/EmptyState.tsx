import Link from "next/link";
import { cva } from "class-variance-authority";
import { CircleAlert, CircleCheck, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Empty states have three registers (00-principles.md):
 *   first-use  directive — there is nothing yet, here is how to start
 *   cleared    affirming — you finished everything, well done
 *   error      calm + retry — something failed, it is not your fault
 *
 * The registers are not cosmetic. "No appointments" as a first-use state is an
 * invitation; as a cleared state it is a reassurance; as an error it is a
 * failure. Same words, three different meanings — so the register is required.
 */
export type EmptyRegister = "first-use" | "cleared" | "error";

export type EmptyStateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export type EmptyStateProps = {
  register: EmptyRegister;
  title: string;
  description?: string;
  /** Overrides the register's default. */
  icon?: LucideIcon;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
};

const REGISTER_DEFAULTS: Record<
  EmptyRegister,
  { Icon: LucideIcon; iconClass: string; role?: "status" | "alert" }
> = {
  "first-use": { Icon: Sparkles, iconClass: "text-primary" },
  // Announced because it follows a user action (clearing the last item).
  cleared: { Icon: CircleCheck, iconClass: "text-success", role: "status" },
  // --warning, NEVER --destructive. 00-principles says "calm + retry", and a
  // red-filled panel in a medical app reads as the PATIENT being in trouble.
  error: { Icon: CircleAlert, iconClass: "text-warning", role: "alert" },
};

const empty = cva(
  "flex flex-col items-center justify-center gap-3 rounded-lg px-6 py-12 text-center",
  {
    variants: {
      register: {
        "first-use": "bg-muted/50",
        cleared: "bg-transparent",
        error: "bg-muted",
      },
    },
    defaultVariants: { register: "first-use" },
  },
);

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: "default" | "outline" | "ghost";
}) {
  if (action.href) {
    return (
      <Button asChild variant={variant} className="min-h-11">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} className="min-h-11" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  register,
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const defaults = REGISTER_DEFAULTS[register];
  const Icon = icon ?? defaults.Icon;
  const primaryVariant = register === "first-use" ? "default" : register === "error" ? "outline" : "ghost";

  return (
    <div role={defaults.role} className={cn(empty({ register }), className)}>
      <Icon aria-hidden="true" className={cn("size-8", defaults.iconClass)} />
      {/* A <p>, not a heading: an empty state sits inside someone else's
          section and must not inject a heading level (axe heading-order). */}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action && <ActionButton action={action} variant={primaryVariant} />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="ghost" />}
        </div>
      )}
    </div>
  );
}
