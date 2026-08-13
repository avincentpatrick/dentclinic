import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { AdminSectionGrid } from "@/components/admin/AdminSectionGrid";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";

export const metadata: Metadata = { title: "Clinic settings" };

/**
 * The admin hub.
 *
 * `src/lib/shell/nav.ts` has linked to `/admin` since Phase 1.2 — from the
 * sidebar, the mobile More sheet and the command palette, all three derived
 * from SIDEBAR_NAV — while the route did not exist. Every superadmin who
 * clicked "Clinic settings" got a 404. This page is what that link meant.
 *
 * No ROUTE_RULES change was needed: `{ prefix: "/admin", roles: ["superadmin"] }`
 * (src/lib/roles.ts) already covers this path and everything under it, and
 * `npm run check:routes` proves that rather than assuming it. A staff or
 * patient session is redirected to their own home by middleware — a redirect,
 * never a 404, so the route table is not enumerable.
 *
 * No EmptyState: the page is not empty. `(admin)/dashboard` uses one because it
 * genuinely has nothing to show until Phase 8; this has a live section today
 * and a legible roadmap for the rest.
 */
export default function AdminHub() {
  return (
    <>
      <PageHeader
        title="Clinic settings"
        description="Everything this installation configures about itself."
      />
      <AdminSectionGrid sections={ADMIN_SECTIONS} />
    </>
  );
}
