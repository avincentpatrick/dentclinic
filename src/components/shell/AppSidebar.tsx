"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { FEEDBACK_BADGE_ITEM_ID, SIDEBAR_NAV, isActive, navHref } from "@/lib/shell/nav";
import { NavCountBadge } from "@/components/shell/NavCountBadge";
import { SIDEBAR_COOKIE, SIDEBAR_MAX_AGE, SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH } from "@/lib/shell/config";
import { useCommandK } from "@/components/search/CommandKProvider";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Desktop navigation: 256px expanded / 56px rail, cookie-persisted.
 *
 * Hidden below md via `display:none`, so the bottom tab bar is the only nav in
 * the accessibility tree on mobile and vice versa.
 *
 * The toggle writes the cookie and mutates --sidebar-w on the shell wrapper
 * directly: no server round-trip, no re-render, and the next SSR is already
 * correct. Sidebar width is NOT mirrored to the DB — theme and font size are
 * accessibility preferences that should follow a user across devices; sidebar
 * width is a per-device viewport choice.
 */
export function AppSidebar({
  role,
  defaultCollapsed,
  brandName,
  brandLogoUrl,
  feedbackCount = 0,
  children,
}: {
  role: AppRole;
  defaultCollapsed: boolean;
  brandName: string;
  brandLogoUrl?: string | null;
  /** Unread feedback reports. Superadmin only; 0 for everyone else. */
  feedbackCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const commandK = useCommandK();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const groups = SIDEBAR_NAV[role];

  function toggle() {
    const next = collapsed ? "expanded" : "collapsed";
    document.cookie = `${SIDEBAR_COOKIE}=${next};path=/;max-age=${SIDEBAR_MAX_AGE};samesite=lax`;
    const root = document.querySelector<HTMLElement>("[data-sidebar]");
    if (root) {
      root.dataset.sidebar = next;
      root.style.setProperty("--sidebar-w", next === "collapsed" ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH);
    }
    setCollapsed(!collapsed);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-border bg-sidebar",
          "transition-[width] duration-200 motion-reduce:transition-none md:flex",
        )}
      >
        <div className={cn("flex h-14 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
          {/* The logo sits BESIDE the name, never instead of it. A wordmark is
              not a substitute for the clinic's name in the accessibility tree,
              and a broken image would otherwise leave the sidebar unlabelled.
              It shows when collapsed too, where it is the only brand cue that
              fits the 56px rail. */}
          {brandLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brandLogoUrl}
              alt=""
              width={24}
              height={24}
              referrerPolicy="no-referrer"
              className="size-6 shrink-0 object-contain"
            />
          )}
          {!collapsed && (
            <span className="truncate font-semibold text-sidebar-foreground">{brandName}</span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "ml-auto grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              collapsed && "ml-0",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
        </div>

        <div className={cn("px-3", collapsed && "px-2")}>
          <SidebarButton
            collapsed={collapsed}
            label="Search"
            icon={Search}
            onClick={commandK.open}
            hint="⌘K"
          />
        </div>

        <Separator className="my-3" />

        <nav aria-label="Sidebar navigation" className="flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group, index) => (
            <div key={group.id} className={cn(index > 0 && "mt-6")}>
              {group.label && !collapsed && (
                <h2 className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h2>
              )}
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => {
                  if (item.kind !== "link") return null;
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.id}>
                      <SidebarLink
                        collapsed={collapsed}
                        href={navHref(item, pathname)}
                        label={item.label}
                        icon={item.icon}
                        active={active}
                        badge={
                          item.id === FEEDBACK_BADGE_ITEM_ID ? (
                            <NavCountBadge count={feedbackCount} label="new reports" />
                          ) : null
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <Separator />
        <div className={cn("p-3", collapsed && "px-2")}>{children}</div>
      </aside>
    </TooltipProvider>
  );
}

const ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function SidebarLink({
  collapsed,
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  collapsed: boolean;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  active: boolean;
  /**
   * Rendered after the label. Suppressed when the rail is collapsed: the label
   * is sr-only there, so a bare number beside an icon would announce as a
   * count of nothing in particular.
   */
  badge?: React.ReactNode;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        ITEM_CLASS,
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      {collapsed ? <span className="sr-only">{label}</span> : label}
      {!collapsed && badge}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarButton({
  collapsed,
  label,
  icon: Icon,
  onClick,
  hint,
}: {
  collapsed: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onClick: () => void;
  hint?: string;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        ITEM_CLASS,
        "border border-input text-muted-foreground hover:bg-accent hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        <>
          {label}
          {hint && <kbd className="ml-auto text-xs text-muted-foreground">{hint}</kbd>}
        </>
      )}
    </button>
  );

  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
