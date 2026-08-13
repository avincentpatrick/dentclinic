import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminSection } from "@/lib/admin/sections";

/**
 * The admin hub's card grid.
 *
 * A Server Component with no state: every card is either a link or it is not,
 * decided entirely by whether the section carries an `href`. There is no
 * `disabled` prop and no way to pass one — an unbuilt section cannot be made
 * clickable by a call site.
 *
 * Unbuilt sections stay VISIBLE rather than being filtered out. The hub is also
 * the roadmap: a superadmin looking for "where do I change the cancellation
 * reasons" is better served by "Arrives in Phase 2.2b" than by silence, which
 * reads as "this product cannot do that".
 *
 * Availability is always spelled out. The muted styling is the redundant
 * signal, not the only one (WCAG 1.4.1).
 */
export function AdminSectionGrid({ sections }: { sections: readonly AdminSection[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {sections.map((section) => {
        const Icon = section.icon;
        const body = (
          <>
            {/* Only pairs declared in scripts/contrast-pairs.mjs are used here:
                primary-foreground/primary, secondary-foreground/secondary,
                foreground/card and muted-foreground/card. There is no
                `--primary-soft` — the soft/on-soft triplets exist only for the
                13 fixed-hue semantic tokens, not for the brand-derived ones. */}
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg",
                section.href
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-medium text-foreground">{section.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{section.description}</span>
              <span
                className={cn(
                  "mt-2 block text-xs font-medium",
                  section.href ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {section.availability}
              </span>
            </span>
          </>
        );

        return (
          <li key={section.id}>
            {section.href ? (
              <Link
                href={section.href}
                className={cn(
                  "flex min-h-11 gap-3 rounded-xl bg-card p-4 ring-1 ring-border transition-colors",
                  "hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                )}
              >
                {body}
              </Link>
            ) : (
              // Not a <button disabled> and not a focusable element: there is
              // nothing to activate, so putting it in the tab order would give
              // a keyboard user a stop that does nothing.
              //
              // Same `bg-card` as the linked cards, not a dimmed variant: an
              // alpha-modified surface composites to a colour that is not a
              // token and therefore is not swept by check:contrast. The muted
              // icon chip and the availability line carry the distinction.
              <div className="flex min-h-11 gap-3 rounded-xl bg-card p-4 ring-1 ring-border">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
