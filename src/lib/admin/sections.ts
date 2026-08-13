import { Building2, ListTree, Mail, MessageSquareWarning, Palette, ScrollText, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The admin hub's contents.
 *
 * Pure data with no JSX, so the gallery specimen can render the REAL list
 * rather than a fixture — which is what makes the composition worth testing:
 * a section added without an `href` is proven non-clickable by the same array
 * the page uses.
 *
 * `href` is OPTIONAL, and that is the whole design. Most of these screens do
 * not exist yet, and a hub that can express "link to a page that isn't built"
 * is a hub that will eventually ship a 404. Making the absence structural means
 * AdminSectionGrid renders a non-interactive card instead — the same
 * "make the bug unrepresentable" move as StatusChip deriving its label and icon
 * from the status key.
 */

export type AdminSection = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Absent means "not built yet" — the grid renders a card, never a link. */
  href?: string;
  /**
   * Availability in words, always rendered. The same rule as never signalling
   * status by colour alone: "greyed out" is not information.
   */
  availability: string;
};

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    id: "branding",
    title: "Branding",
    description: "Clinic name, tagline, logo and the brand colour used across the whole app.",
    icon: Palette,
    href: "/admin/branding",
    availability: "Available",
  },
  {
    id: "lookups",
    title: "Lookups",
    description:
      "Appointment types with their durations and buffers, treatment rooms, cancellation reasons, payment methods and fees.",
    icon: ListTree,
    href: "/admin/lookups",
    availability: "Available",
  },
  {
    id: "email",
    title: "Email",
    description: "Sending provider, the clinic's from-address, and SPF/DKIM/DMARC checks.",
    icon: Mail,
    // Deferred whole, not merely pending: no free sending provider is reachable
    // without a domain. PROGRESS decision 24 carries the trigger to revisit.
    availability: "Deferred — needs a sending provider and a domain",
  },
  {
    id: "feedback",
    title: "Feedback",
    description: "Bug reports and suggestions filed by anyone using the system.",
    icon: MessageSquareWarning,
    availability: "Arrives in Phase 2.2d",
  },
  {
    id: "clinic",
    title: "Clinic details",
    description: "Opening hours, timezone, booking lead time and how far ahead patients may book.",
    icon: Building2,
    availability: "Arrives with the scheduling engine",
  },
  {
    id: "users",
    title: "People and access",
    description: "Invite staff and doctors, change roles, and deactivate accounts.",
    icon: Users,
    availability: "Arrives with the users-admin module",
  },
  {
    id: "audit",
    title: "Audit log",
    description: "Who read or changed which record, and when.",
    icon: ScrollText,
    availability: "Arrives with the audit viewer",
  },
];
