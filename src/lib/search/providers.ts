import { navLinks } from "@/lib/shell/nav";
import type { SearchProvider, SearchResult } from "@/lib/search/sections";

/**
 * Navigate: every destination the user's role can reach. Purely local — no
 * network, no PHI. This is the ONLY provider in Phase 1.
 */
export const navigateProvider: SearchProvider = {
  section: "navigate",
  enabledFor: () => true,
  async query(_q, { role }): Promise<SearchResult[]> {
    return navLinks(role).map((item) => ({
      id: `nav:${item.id}`,
      section: "navigate",
      label: item.label,
      href: item.href,
      icon: item.icon,
      keywords: [item.href.replace("/", "")],
    }));
  },
};

/**
 * Phase 8.2 appends recentProvider, actionsProvider, patientProvider,
 * appointmentProvider, recordsProvider, helpProvider here. The palette renders
 * SECTION_ORDER and skips empty groups, so nothing else changes.
 */
export const providers: SearchProvider[] = [navigateProvider];
