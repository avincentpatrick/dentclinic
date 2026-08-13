import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors DataTable's box model at both breakpoints, so nothing shifts when the
 * real rows arrive. Same dual render (`md:hidden` / `hidden md:block`) as the
 * component itself — a single-shape skeleton would jump on one of the two.
 *
 * aria-hidden: a loading placeholder is not content. The Suspense boundary and
 * the page's own heading already tell a screen reader where it is.
 */
export function DataTableSkeleton({ rows = 8, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      {/* phones: cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="rounded-lg border border-border p-4">
            <Skeleton className="h-5 w-40" />
            <div className="mt-2 flex gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          </li>
        ))}
      </ul>

      {/* md+: table */}
      <div className="hidden md:block">
        <div className="flex gap-3 border-b border-border px-3 py-2">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3 border-b border-border px-3 py-3 last:border-0">
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton key={j} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
