import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Sibling skeleton for UserChip. Mirrors the real component's box model —
 * same avatar size, same two text rows, same gaps — so nothing shifts when the
 * data resolves. aria-hidden because the Suspense boundary carries aria-busy;
 * an announced skeleton is screen-reader noise.
 *
 * See docs/design-system/05-patterns/skeletons.md.
 */
export function UserChipSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div aria-hidden="true" className={cn("flex items-center gap-3", collapsed && "flex-col gap-2")}>
      <Skeleton className="size-9 shrink-0 rounded-full" />
      {!collapsed && (
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      )}
      <Skeleton className="h-11 w-16 rounded-md" />
    </div>
  );
}
