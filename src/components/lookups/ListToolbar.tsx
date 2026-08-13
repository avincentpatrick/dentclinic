import { Suspense } from "react";
import Link from "next/link";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { SearchField } from "@/components/shared/SearchField";
import { cn } from "@/lib/utils";

/**
 * Search box + Active/Archived filter, for a server-driven list page.
 *
 * Props-only Server Component. It was inlined in `/patients/page.tsx` and was
 * about to be written three more times for the lookups screens — and it is what
 * lets the gallery's `layouts` specimens render the real header instead of a
 * re-typed copy of it.
 *
 * Both filter links are always rendered, and the current one carries
 * `aria-current="page"`: a filter that hides itself when active leaves the user
 * with no way back and nothing announcing which view they are in.
 */
export function ListToolbar({
  action,
  searchLabel,
  searchPlaceholder,
  query,
  archived,
  activeHref,
  archivedHref,
  archivedNotice,
}: {
  /** The page this filters, e.g. "/admin/lookups/appointment-types". */
  action: string;
  searchLabel: string;
  searchPlaceholder: string;
  query: string;
  archived: boolean;
  activeHref: string;
  archivedHref: string;
  /** Sentence shown while the Archived view is on. */
  archivedNotice: string;
}) {
  return (
    <>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          {/* SearchField reads useSearchParams; the Suspense boundary keeps that
              out of the page's own render path. */}
          <Suspense fallback={<div className="h-11" />}>
            <SearchField
              action={action}
              label={searchLabel}
              placeholder={searchPlaceholder}
              defaultValue={query}
            />
          </Suspense>
        </div>
        <nav aria-label="Record status" className="flex shrink-0 gap-1">
          <FilterLink href={activeHref} current={!archived} label="Active" />
          <FilterLink href={archivedHref} current={archived} label="Archived" />
        </nav>
      </div>

      {archived && (
        <div className="mt-4">
          <InlineAlert tone="info" title="Showing archived entries">
            <p>{archivedNotice}</p>
          </InlineAlert>
        </div>
      )}
    </>
  );
}

function FilterLink({ href, current, label }: { href: string; current: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
        current
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
