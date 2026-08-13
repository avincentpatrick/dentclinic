import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarClock,
  Ellipsis,
  FileText,
  House,
  LayoutDashboard,
  Palette,
  Plus,
  Search,
  Settings,
  User,
  Users,
} from "lucide-react";
import type { AppRole } from "@/lib/roles";

/**
 * Navigation config.
 *
 * WARNING: `icon` is a React component — a function — and functions cannot
 * cross the server→client props boundary. AppShell (server) therefore passes
 * only `role: AppRole`; BottomTabBar and AppSidebar (both clients) import this
 * module directly. Passing a NavItem as a prop throws at runtime.
 *
 * Also: never import this from middleware — it would drag lucide into the edge
 * bundle. Icon-free shell constants live in ./config.
 */

export type NavItem =
  | {
      kind: "link";
      id: string;
      label: string;
      href: string;
      icon: LucideIcon;
      match: "exact" | "prefix";
      /** Phase this destination becomes real. Annotation only — never disables anything. */
      phase?: number;
    }
  | { kind: "fab"; id: string; label: string; href: string; icon: LucideIcon }
  | { kind: "command"; id: string; label: string; icon: LucideIcon }
  | { kind: "sheet"; id: string; label: string; icon: LucideIcon };

const PATIENT_TABS: NavItem[] = [
  { kind: "link", id: "home", label: "Home", href: "/home", icon: House, match: "exact" },
  { kind: "link", id: "appointments", label: "Appointments", href: "/appointments", icon: Calendar, match: "prefix", phase: 4 },
  { kind: "fab", id: "book", label: "Book", href: "/book", icon: Plus },
  { kind: "link", id: "records", label: "Records", href: "/records", icon: FileText, match: "prefix", phase: 6 },
  { kind: "link", id: "profile", label: "Profile", href: "/profile", icon: User, match: "prefix", phase: 2 },
];

const STAFF_TABS: NavItem[] = [
  { kind: "link", id: "today", label: "Today", href: "/today", icon: CalendarClock, match: "exact" },
  { kind: "link", id: "schedule", label: "Schedule", href: "/schedule", icon: Calendar, match: "prefix", phase: 3 },
  { kind: "link", id: "patients", label: "Patients", href: "/patients", icon: Users, match: "prefix", phase: 2 },
  { kind: "command", id: "search", label: "Search", icon: Search },
  { kind: "sheet", id: "more", label: "More", icon: Ellipsis },
];

const ADMIN_TABS: NavItem[] = [
  { kind: "link", id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: "exact" },
  { kind: "link", id: "today", label: "Today", href: "/today", icon: CalendarClock, match: "exact" },
  { kind: "link", id: "patients", label: "Patients", href: "/patients", icon: Users, match: "prefix", phase: 2 },
  { kind: "command", id: "search", label: "Search", icon: Search },
  { kind: "sheet", id: "more", label: "More", icon: Ellipsis },
];

/** Mobile bottom tab bar — max 5 items, thumb-first. */
export const TAB_NAV: Record<AppRole, NavItem[]> = {
  patient: PATIENT_TABS,
  staff: STAFF_TABS,
  doctor: STAFF_TABS,
  superadmin: ADMIN_TABS,
};

export type NavGroup = { id: string; label?: string; items: NavItem[] };

/** Desktop sidebar / mobile "More" sheet. Supersets the tab bar. */
export const SIDEBAR_NAV: Record<AppRole, NavGroup[]> = {
  patient: [
    { id: "main", items: PATIENT_TABS.filter((i) => i.kind !== "fab") },
    {
      id: "settings",
      label: "Settings",
      items: [
        { kind: "link", id: "appearance", label: "Appearance", href: "/settings/appearance", icon: Palette, match: "prefix" },
      ],
    },
  ],
  staff: [
    { id: "main", items: STAFF_TABS.filter((i) => i.kind === "link") },
    {
      id: "settings",
      label: "Settings",
      items: [
        // /profile is granted to ALL_ROLES (roles.ts) and increment 2.0 did
        // explicit work — the (shared) group, SHARED_SURFACES, the x-role header
        // — to make it role-correct. Until 2.2b only the patient tab bar linked
        // to it, so for staff-side roles it was a route deliberately made
        // correct with no way to reach it. Here rather than in the tab bars,
        // which are already at their five-item cap.
        { kind: "link", id: "profile", label: "My profile", href: "/profile", icon: User, match: "prefix", phase: 2 },
        { kind: "link", id: "appearance", label: "Appearance", href: "/settings/appearance", icon: Palette, match: "prefix" },
      ],
    },
  ],
  doctor: [
    {
      id: "main",
      items: [
        ...STAFF_TABS.filter((i) => i.kind === "link"),
        { kind: "link", id: "availability", label: "Availability", href: "/availability", icon: CalendarClock, match: "prefix", phase: 3 },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      items: [
        { kind: "link", id: "profile", label: "My profile", href: "/profile", icon: User, match: "prefix", phase: 2 },
        { kind: "link", id: "appearance", label: "Appearance", href: "/settings/appearance", icon: Palette, match: "prefix" },
      ],
    },
  ],
  superadmin: [
    { id: "main", items: ADMIN_TABS.filter((i) => i.kind === "link") },
    {
      id: "admin",
      label: "Administration",
      items: [
        { kind: "link", id: "admin", label: "Clinic settings", href: "/admin", icon: Settings, match: "prefix", phase: 2 },
        { kind: "link", id: "design-system", label: "Design system", href: "/design-system", icon: Palette, match: "prefix" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      items: [
        { kind: "link", id: "profile", label: "My profile", href: "/profile", icon: User, match: "prefix", phase: 2 },
        { kind: "link", id: "appearance", label: "Appearance", href: "/settings/appearance", icon: Palette, match: "prefix" },
      ],
    },
  ],
};

/** Active-state test. `exact` for hubs, `prefix` for sections with children. */
export function isActive(pathname: string, item: Extract<NavItem, { kind: "link" | "fab" }>): boolean {
  if (item.kind === "fab") return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return item.match === "exact"
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Flat list of navigable links for a role — used by the command palette. */
export function navLinks(role: AppRole): Extract<NavItem, { kind: "link" }>[] {
  const seen = new Set<string>();
  return SIDEBAR_NAV[role]
    .flatMap((g) => g.items)
    .filter((i): i is Extract<NavItem, { kind: "link" }> => i.kind === "link")
    .filter((i) => (seen.has(i.href) ? false : (seen.add(i.href), true)));
}
