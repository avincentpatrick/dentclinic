import { Suspense } from "react";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { BottomTabBar } from "@/components/shell/BottomTabBar";
import { IdleTimeoutGuard } from "@/components/shell/IdleTimeoutGuard";
import { UserChip } from "@/components/shell/UserChip";
import { UserChipSkeleton } from "@/components/shell/UserChip.skeleton";
import { Toaster } from "@/components/shared/Toaster";
import { CommandKProvider } from "@/components/search/CommandKProvider";
import { AppearanceMenu } from "@/components/theme/AppearanceMenu";
import { getBranding } from "@/lib/branding";
import { getNewReportCount } from "@/lib/feedback/read";
import { IDLE_MS, IDLE_WARN_MS, SIDEBAR_COOKIE, SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH } from "@/lib/shell/config";
import type { AppRole } from "@/lib/roles";

/**
 * The shared shell. Server component — it passes only `role` (a string) to the
 * client nav components, because the nav config carries icon *functions* which
 * cannot cross the server→client boundary.
 *
 * Mobile and desktop navigation both render; `display:none` picks one. That
 * removes the hidden tree from the accessibility tree entirely, so the cost is
 * ~2-4KB of markup and nothing in correctness — whereas a JS breakpoint hook
 * would have to guess on the server and correct on the client, reintroducing
 * exactly the flash the token system was built to avoid.
 */
export async function AppShell({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const [jar, branding, feedbackCount] = await Promise.all([
    cookies(),
    getBranding(),
    // 16-feedback.md rule 4: filing never sends email, so the queue itself is
    // the notification. Superadmin only -- nobody else can read the queue, and
    // a count of rows they cannot open would be noise. `getNewReportCount`
    // returns 0 on any failure: a badge must never take the shell down.
    role === "superadmin" ? getNewReportCount() : Promise.resolve(0),
  ]);
  const collapsed = jar.get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <CommandKProvider role={role}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div
        data-sidebar={collapsed ? "collapsed" : "expanded"}
        style={
          {
            "--sidebar-w": collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH,
          } as React.CSSProperties
        }
        className="min-h-dvh"
      >
        <AppSidebar
          role={role}
          defaultCollapsed={collapsed}
          feedbackCount={feedbackCount}
          brandName={branding.clinicName}
          brandLogoUrl={branding.logoUrl}
        >
          <Suspense fallback={<UserChipSkeleton collapsed={collapsed} />}>
            <UserChip collapsed={collapsed} />
          </Suspense>
        </AppSidebar>

        <div className="transition-[padding] duration-200 motion-reduce:transition-none md:pl-[var(--sidebar-w)]">
          <header className="flex h-14 items-center justify-end gap-2 px-4 md:justify-end">
            <AppearanceMenu />
          </header>

          <main
            id="main"
            className="mx-auto w-full max-w-5xl px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-2 md:pb-10"
          >
            {children}
          </main>
        </div>

        <BottomTabBar role={role} feedbackCount={feedbackCount} />
        <IdleTimeoutGuard idleMs={IDLE_MS[role]} warnMs={IDLE_WARN_MS} />
        {/* Mounted here rather than in the root layout: /login, /book and
            /settings/appearance have no toasts and should not pay for the
            chunk. Every signed-in surface goes through this shell. */}
        <Toaster />
      </div>
    </CommandKProvider>
  );
}
