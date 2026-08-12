import { CalendarClock, Inbox } from "lucide-react";
import { ErrorEmptyStateSpecimen } from "@/components/gallery/specimens/ErrorEmptyStateSpecimen";
import { ClinicalChip, StatusChip, CLINICAL_LEVELS, STATUS_KEYS } from "@/components/shared/StatusChip";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { UserChipSkeleton } from "@/components/shell/UserChip.skeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * THE single source of truth for the gallery.
 *
 * Specimens use HARD-CODED FIXTURES ONLY — never Supabase, never server
 * actions. Enforced by an eslint no-restricted-imports rule on this directory,
 * because the gallery is the one route with an audit bypass and its blast
 * radius must be zero by construction, not by discipline.
 *
 * scripts/check-gallery-docs.mjs asserts both directions: every entry's `doc`
 * file exists, and every 04-components/*.md has an entry here.
 */

export type Specimen = { name: string; note?: string; render: () => React.ReactNode };

export type GalleryEntry = {
  id: string;
  name: string;
  group: "shell" | "shared" | "search" | "feedback";
  doc: string;
  description: string;
  specimens: Specimen[];
};

export const registry: GalleryEntry[] = [
  {
    id: "status-chip",
    name: "StatusChip",
    group: "shared",
    doc: "docs/design-system/04-components/status-chip.md",
    description: "Appointment and clinical status. Always chip + label + icon — never colour alone.",
    specimens: [
      {
        name: "All appointment statuses",
        render: () => (
          <div className="flex flex-wrap gap-2">
            {STATUS_KEYS.map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>
        ),
      },
      {
        name: "All clinical levels",
        render: () => (
          <div className="flex flex-wrap gap-2">
            {CLINICAL_LEVELS.map((l) => (
              <ClinicalChip key={l} level={l} />
            ))}
          </div>
        ),
      },
      {
        name: "Small size",
        note: "For dense tables and calendar cells.",
        render: () => (
          <div className="flex flex-wrap gap-2">
            {STATUS_KEYS.slice(0, 3).map((s) => (
              <StatusChip key={s} status={s} size="sm" />
            ))}
          </div>
        ),
      },
    ],
  },
  {
    id: "empty-state",
    name: "EmptyState",
    group: "shared",
    doc: "docs/design-system/04-components/empty-state.md",
    description: "Three registers: first-use (directive), cleared (affirming), error (calm + retry).",
    specimens: [
      {
        name: "first-use",
        render: () => (
          <EmptyState
            register="first-use"
            icon={CalendarClock}
            title="No appointments yet"
            description="Book your first visit — it takes about a minute."
            action={{ label: "Book a visit", href: "/book" }}
          />
        ),
      },
      {
        name: "cleared",
        render: () => (
          <EmptyState
            register="cleared"
            icon={Inbox}
            title="All caught up"
            description="Every reminder for today has been sent."
          />
        ),
      },
      {
        name: "error",
        note: "Uses --warning, never --destructive: a red panel reads as the patient being in trouble.",
        render: () => <ErrorEmptyStateSpecimen />,
      },
    ],
  },
  {
    id: "page-header",
    name: "PageHeader",
    group: "shell",
    doc: "docs/design-system/04-components/page-header.md",
    description: "The single <h1> for a page, with optional description and actions.",
    specimens: [
      {
        name: "Title only",
        render: () => <PageHeader title="Patients" />,
      },
      {
        name: "With description and action",
        render: () => (
          <PageHeader
            title="Patients"
            description="The clinic patient roster."
            actions={<Button className="min-h-11">Add patient</Button>}
          />
        ),
      },
    ],
  },
  {
    id: "skeleton",
    name: "Skeleton",
    group: "feedback",
    doc: "docs/design-system/04-components/skeleton.md",
    description: "Sibling files that mirror the real component's box model, so nothing shifts on resolve.",
    specimens: [
      {
        name: "UserChipSkeleton",
        note: "The real skeleton used by the sidebar's Suspense boundary.",
        render: () => (
          <div className="max-w-xs rounded-md border border-border p-3">
            <UserChipSkeleton />
          </div>
        ),
      },
      {
        name: "Primitive",
        render: () => (
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ),
      },
    ],
  },
  {
    id: "button",
    name: "Button",
    group: "shared",
    doc: "docs/design-system/04-components/button.md",
    description: "shadcn Button on our tokens. All targets ≥2.75rem in app usage.",
    specimens: [
      {
        name: "Variants",
        render: () => (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11">Default</Button>
            <Button variant="secondary" className="min-h-11">Secondary</Button>
            <Button variant="outline" className="min-h-11">Outline</Button>
            <Button variant="ghost" className="min-h-11">Ghost</Button>
            <Button variant="destructive" className="min-h-11">Archive</Button>
          </div>
        ),
      },
      {
        name: "Disabled",
        render: () => (
          <Button disabled className="min-h-11">
            Unavailable
          </Button>
        ),
      },
    ],
  },
  {
    id: "app-sidebar",
    name: "AppSidebar",
    group: "shell",
    doc: "docs/design-system/04-components/app-sidebar.md",
    description:
      "Desktop navigation: 256px / 56px rail, cookie-persisted. Rendered live around this page — resize to see the CSS-only switch to the bottom tab bar.",
    specimens: [],
  },
  {
    id: "bottom-tab-bar",
    name: "BottomTabBar",
    group: "shell",
    doc: "docs/design-system/04-components/bottom-tab-bar.md",
    description:
      "Mobile navigation with role variants. Rendered live below on small viewports; hidden at md+ via display:none.",
    specimens: [],
  },
  {
    id: "command-k",
    name: "CommandK",
    group: "search",
    doc: "docs/design-system/04-components/command-k.md",
    description: "⌘K / Ctrl+K, or press / outside a text field. Phase 1 ships Navigate only.",
    specimens: [],
  },
  {
    id: "idle-timeout-guard",
    name: "IdleTimeoutGuard",
    group: "shell",
    doc: "docs/design-system/04-components/idle-timeout-guard.md",
    description:
      "Warn-then-logout after inactivity (staff 15 min, patient 30). Mounted live in the shell — not previewable as a specimen without hijacking your session.",
    specimens: [],
  },
  {
    id: "appearance-panel",
    name: "AppearancePanel",
    group: "shared",
    doc: "docs/design-system/04-components/appearance-panel.md",
    description: "Theme and text size. The live control is embedded at the top of this page.",
    specimens: [],
  },
];
