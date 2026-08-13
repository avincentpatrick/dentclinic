"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FEEDBACK_BADGE_ITEM_ID, SIDEBAR_NAV, isActive, navHref } from "@/lib/shell/nav";
import { NavCountBadge } from "@/components/shell/NavCountBadge";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * The third sidebar presentation: full navigation as a bottom sheet, reached
 * from the staff/admin "More" tab. Patients never see it — their five tabs are
 * their entire navigation surface.
 */
export function MoreSheet({
  role,
  trigger,
  feedbackCount = 0,
}: {
  role: AppRole;
  trigger: React.ReactNode;
  feedbackCount?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = SIDEBAR_NAV[role];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription className="sr-only">All destinations available to you.</SheetDescription>
        </SheetHeader>

        <nav aria-label="More navigation" className="flex flex-col gap-6 px-4 pb-6">
          {groups.map((group) => (
            <div key={group.id}>
              {group.label && (
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h2>
              )}
              <ul className="flex flex-col gap-1">
                {group.items
                  .filter((i) => i.kind === "link")
                  .map((item) => {
                    if (item.kind !== "link") return null;
                    const { icon: Icon, label, id } = item;
                    // navHref, not item.href: "Report a problem" carries the
                    // screen the user is leaving. See carriesFrom in nav.ts.
                    const href = navHref(item, pathname);
                    const active = isActive(pathname, item);
                    return (
                      <li key={id}>
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                            active
                              ? "bg-accent font-medium text-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <Icon aria-hidden="true" className="size-5 shrink-0" />
                          {label}
                          {id === FEEDBACK_BADGE_ITEM_ID && (
                            <NavCountBadge count={feedbackCount} label="new reports" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
