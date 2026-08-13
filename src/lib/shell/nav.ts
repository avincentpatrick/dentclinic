import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarClock,
  Ellipsis,
  FileText,
  House,
  LayoutDashboard,
  MessageSquareWarning,
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
 *
 * SINCE 2.2d, `scripts/check-routes.mjs` ASSERTS EVERY href HERE RESOLVES to a
 * real route. It was added for ADMIN_SECTIONS in 2.2b but the bug it was
 * written about happened in this file: "Clinic settings" linked to /admin from
 * the sidebar, the More sheet and ⌘K for two whole phases before the page
 * existed. Pointing the same check here found a second live instance
 * immediately — see the doctor group below.
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
      /**
       * Append `?from=<the screen the user is on>` when rendering this link.
       *
       * Only /feedback uses it, and it is what gives the feedback module its
       * value: a report filed from a generic "Report a problem" page knows
       * nothing about where the bug was, and asking people to describe the
       * screen gets you "the patient page" at best. The nav components are
       * clients and already know `usePathname()`, so the link carries it.
       *
       * The value is UNTRUSTED — a query string anyone can edit. `fileReport`
       * maps it onto ROUTE_PATTERNS with `maskPath` and stores the pattern, so
       * what reaches the database is a route the app itself declares, never
       * text the browser supplied. See rule 1 of docs/modules/16-feedback.md.
       */
      carriesFrom?: boolean;
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

/**
 * "Report a problem", in every role's Settings group.
 *
 * One constant rather than four copies: 16-feedback.md puts this in front of
 * every signed-in role, and four literals is four chances for one of them to
 * lose `carriesFrom` and quietly start filing reports with no screen attached.
 *
 * A plain link, not a dialog. The module doc describes a lazy-loaded
 * FeedbackDialog, and that is still the nicer affordance — but the link already
 * carries the originating screen, is picked up by the sidebar, the More sheet
 * and the command palette for free (all three filter for `kind === "link"`),
 * and costs no client bundle. So the dialog is polish, not capability;
 * deferred, with that reasoning recorded in the module doc.
 */
const REPORT_PROBLEM: NavItem = {
  kind: "link",
  id: "feedback",
  label: "Report a problem",
  href: "/feedback",
  icon: MessageSquareWarning,
  match: "prefix",
  phase: 2,
  carriesFrom: true,
};

/**
 * The nav item that shows the unread-report count.
 *
 * Named here so AppShell, AppSidebar and MoreSheet agree without three string
 * literals -- a typo in any one of them would silently drop the badge, which
 * fails as "no reports waiting", the most misleading way it could fail.
 */
export const FEEDBACK_BADGE_ITEM_ID = "admin-feedback";

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
        REPORT_PROBLEM,
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
        REPORT_PROBLEM,
      ],
    },
  ],
  doctor: [
    {
      id: "main",
      items: [
        ...STAFF_TABS.filter((i) => i.kind === "link"),
        // PHASE 3 PUTS "Availability" BACK HERE:
        //   kind link, id availability, label Availability, icon CalendarClock,
        //   match prefix, pointing at the availability editor 3.1 builds.
        //
        // Removed in 2.2d because that route HAS NO PAGE — every doctor who
        // opened this menu and clicked it got a 404, exactly as every
        // superadmin who clicked "Clinic settings" did for the two phases
        // before 2.2a built /admin. Found by check:routes the first time it was
        // pointed at this file, which is the whole argument for pointing it
        // here: `phase: 3` is an annotation, and an annotation does not stop a
        // link being clickable.
        //
        // A comment rather than a `phase`-gated render, because
        // AdminSectionGrid already settled the shape: an unbuilt destination
        // should be UNREPRESENTABLE as a link, not conditionally suppressed.
        // (Written without the literal property name so the check, which reads
        // this file by regex, does not see a live href in a comment.)
      ],
    },
    {
      id: "settings",
      label: "Settings",
      items: [
        { kind: "link", id: "profile", label: "My profile", href: "/profile", icon: User, match: "prefix", phase: 2 },
        { kind: "link", id: "appearance", label: "Appearance", href: "/settings/appearance", icon: Palette, match: "prefix" },
        REPORT_PROBLEM,
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
        // The triage queue, linked directly rather than only through the hub,
        // because THIS ENTRY IS THE NOTIFICATION. 16-feedback.md rule 4:
        // "Filing never sends email, and must never be able to" -- people file
        // bug reports at exactly the moment things are broken, and email being
        // broken is one of the things they file about. So the superadmin gets a
        // count badge they pull, instead of a message that can fail to arrive.
        { kind: "link", id: "admin-feedback", label: "Feedback", href: "/admin/feedback", icon: MessageSquareWarning, match: "prefix", phase: 2 },
        { kind: "link", id: "design-system", label: "Design system", href: "/design-system", icon: Palette, match: "prefix" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      items: [
        { kind: "link", id: "profile", label: "My profile", href: "/profile", icon: User, match: "prefix", phase: 2 },
        { kind: "link", id: "appearance", label: "Appearance", href: "/settings/appearance", icon: Palette, match: "prefix" },
        REPORT_PROBLEM,
      ],
    },
  ],
};

/**
 * The href to render for a nav item, given where the user currently is.
 *
 * For everything except "Report a problem" this is just `item.href`. For that
 * one it appends `?from=<pathname>` so the report knows which screen it is
 * about — see `carriesFrom`.
 *
 * The PATHNAME ONLY, never `location.search`: a query string can itself carry
 * an id (`?patient=…`), and rule 1 of the feedback module is that no id is ever
 * recorded. Skipped when the user is already on /feedback, so the link cannot
 * come to mean "reporting about the report form".
 */
export function navHref(item: Extract<NavItem, { kind: "link" }>, pathname: string): string {
  if (!item.carriesFrom || !pathname || pathname === item.href) return item.href;
  return `${item.href}?from=${encodeURIComponent(pathname)}`;
}

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
