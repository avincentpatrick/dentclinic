"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * URL-driven, not React state: the axe spec can request the exact surface it
 * needs (?matrix=all), a reviewer can bookmark a combination, and the page
 * stays a Server Component.
 */
export function GalleryControls() {
  const pathname = usePathname();
  const params = useSearchParams();
  const matrix = params.get("matrix") === "all" ? "all" : "off";

  function href(next: "all" | "off") {
    const q = new URLSearchParams(params.toString());
    if (next === "off") q.delete("matrix");
    else q.set("matrix", next);
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  return (
    <div role="group" aria-label="Gallery display mode" className="inline-flex rounded-md border border-input p-1">
      {(["off", "all"] as const).map((mode) => (
        <Link
          key={mode}
          href={href(mode)}
          aria-current={matrix === mode ? "true" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded px-3 text-sm transition-colors",
            matrix === mode
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {mode === "off" ? "Current theme" : "All themes × sizes"}
        </Link>
      ))}
    </div>
  );
}
