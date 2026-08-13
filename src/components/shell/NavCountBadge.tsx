import { cn } from "@/lib/utils";

/**
 * The unread-report count beside a nav link.
 *
 * 16-feedback.md rule 4 makes this load-bearing rather than decorative: filing
 * a report never sends email and must never be able to, because people file
 * reports at exactly the moment things are broken. This count IS the
 * notification, so it has to survive the ways a badge usually fails.
 *
 * - It renders NOTHING at zero. A "0" is a thing to learn to ignore.
 * - It carries its own words for screen readers. A bare "3" next to "Feedback"
 *   announces as "Feedback 3", which is not a sentence; the visible number is
 *   aria-hidden and the real label is offscreen text.
 * - Colour is never the signal (WCAG 1.4.1) -- the number is the signal, and
 *   the colour only draws the eye to it.
 * - It caps at 99+, because a sidebar that reflows at three digits is a layout
 *   bug waiting for a bad week.
 */
export function NavCountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5",
        "h-5 text-xs font-medium tabular-nums",
        "bg-warning-soft text-warning-on-soft ring-1 ring-inset ring-warning/25",
        className,
      )}
    >
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{`${count} ${label}`}</span>
    </span>
  );
}
