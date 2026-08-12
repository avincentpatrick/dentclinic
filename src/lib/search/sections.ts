import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@/lib/roles";

/**
 * Command palette contract.
 *
 * Phase 1 registers exactly ONE provider (navigate). The section order and the
 * provider interface ship now so Phase 8.2 is a one-line array append rather
 * than a refactor of the rendering code.
 *
 * HARD RULE for Phase 8: the authoritative role scope is the SERVER search API.
 * Phase 1's scoping is client-side and cosmetic because it only filters nav
 * links the user can already see. Never add a data-bearing provider that
 * filters on the client — staff must not receive clinical-note rows at all,
 * not merely have them hidden.
 */

export const SECTION_ORDER = [
  "recent",
  "actions",
  "patients",
  "appointments",
  "navigate",
  "records",
  "help",
] as const;

export type SearchSection = (typeof SECTION_ORDER)[number];

export const SECTION_LABELS: Record<SearchSection, string> = {
  recent: "Recent",
  actions: "Actions",
  patients: "Patients",
  appointments: "Appointments",
  navigate: "Navigate",
  records: "Records",
  help: "Help",
};

export type SearchResult = {
  id: string;
  section: SearchSection;
  label: string;
  sublabel?: string;
  href?: string;
  run?: () => void;
  keywords?: string[];
  icon?: LucideIcon;
};

export type SearchContext = {
  role: AppRole;
  /** Phase 8: contextual patient mode. */
  patientId?: string;
};

export interface SearchProvider {
  section: SearchSection;
  enabledFor(role: AppRole): boolean;
  /** Phase 1: synchronous local data. Phase 8: fetch("/api/search", { signal }). */
  query(q: string, ctx: SearchContext, signal: AbortSignal): Promise<SearchResult[]>;
}
