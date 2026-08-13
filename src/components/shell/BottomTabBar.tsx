"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAB_NAV, isActive, type NavItem } from "@/lib/shell/nav";
import { useCommandK } from "@/components/search/CommandKProvider";
import { MoreSheet } from "@/components/shell/MoreSheet";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation. Hidden at md+ via `display:none` (`md:hidden`), which
 * removes it from the accessibility tree entirely — the desktop sidebar renders
 * the same destinations. Never use opacity/visibility here: those leave the
 * links focusable and announced, producing duplicate nav for screen readers.
 */
export function BottomTabBar({ role, feedbackCount = 0 }: { role: AppRole; feedbackCount?: number }) {
  const pathname = usePathname();
  const items = TAB_NAV[role];

  return (
    <nav
      aria-label="Bottom navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur",
        "pb-[env(safe-area-inset-bottom)] md:hidden",
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {items.map((item) => (
          <li key={item.id} className="flex-1">
            <TabItem item={item} pathname={pathname} role={role} feedbackCount={feedbackCount} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

const TAB_CLASS =
  "relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-ring";

/** Active state is colour + weight + a top indicator bar — never colour alone. */
function ActiveBar() {
  return <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />;
}

function TabItem({
  item,
  pathname,
  role,
  feedbackCount,
}: {
  item: NavItem;
  pathname: string;
  role: AppRole;
  feedbackCount: number;
}) {
  const commandK = useCommandK();

  if (item.kind === "fab") {
    const { icon: Icon, href, label } = item;
    return (
      <Link
        href={href}
        aria-label={label}
        className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5"
      >
        <span
          className={cn(
            "-mt-4 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground",
            "shadow-lg ring-4 ring-background",
          )}
        >
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <span className="text-[0.6875rem] font-medium text-foreground">{label}</span>
      </Link>
    );
  }

  if (item.kind === "command") {
    const { icon: Icon, label } = item;
    return (
      <button type="button" onClick={commandK.open} className={cn(TAB_CLASS, "text-muted-foreground")}>
        <Icon aria-hidden="true" className="size-5" />
        <span>{label}</span>
      </button>
    );
  }

  if (item.kind === "sheet") {
    const { icon: Icon, label } = item;
    return (
      <MoreSheet
        role={role}
        feedbackCount={feedbackCount}
        trigger={
          <button type="button" className={cn(TAB_CLASS, "text-muted-foreground")}>
            <Icon aria-hidden="true" className="size-5" />
            <span>{label}</span>
          </button>
        }
      />
    );
  }

  const { icon: Icon, href, label } = item;
  const active = isActive(pathname, item);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(TAB_CLASS, active ? "font-medium text-primary" : "text-muted-foreground")}
    >
      {active && <ActiveBar />}
      <Icon aria-hidden="true" className="size-5" />
      <span>{label}</span>
    </Link>
  );
}
