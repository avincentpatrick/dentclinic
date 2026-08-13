import { CalendarClock, Inbox } from "lucide-react";
import { AdminSectionGrid } from "@/components/admin/AdminSectionGrid";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { ListToolbar } from "@/components/lookups/ListToolbar";
import { AppointmentTypeFields } from "@/components/lookups/AppointmentTypeFields";
import { FeedbackFields } from "@/components/feedback-report/FeedbackFields";
import { TriageFields } from "@/components/feedback-report/TriageFields";
import { ProfileFields } from "@/components/patients/ProfileFields";
import { BrandingFormSpecimen } from "@/components/gallery/specimens/BrandingFormSpecimen";
import { ErrorEmptyStateSpecimen } from "@/components/gallery/specimens/ErrorEmptyStateSpecimen";
import { ToastSpecimen } from "@/components/gallery/specimens/ToastSpecimen";
import type { GalleryGroup } from "@/components/gallery/groups";
import { DuplicateWarning } from "@/components/patients/DuplicateWarning";
import type { Confirmable } from "@/lib/forms/action-state";
import { SubmitButton } from "@/components/shared/SubmitButton";
import {
  ClinicalChip,
  FeedbackSeverityChip,
  FeedbackStatusChip,
  RecordChip,
  StatusChip,
  CLINICAL_LEVELS,
  FEEDBACK_SEVERITY_KEYS,
  FEEDBACK_STATUS_KEYS,
  RECORD_STATES,
  STATUS_KEYS,
} from "@/components/shared/StatusChip";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { DataTableSkeleton } from "@/components/shared/DataTable.skeleton";
import { Field } from "@/components/shared/Field";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { SearchField } from "@/components/shared/SearchField";

/** Fixtures for the DataTable specimens. Invented people, never real rows. */
type DemoPatient = { id: string; patient_number: string; full_name: string; dob: string };

const PATIENT_ROWS: DemoPatient[] = [
  { id: "1", patient_number: "P00001", full_name: "Maria Santos", dob: "4 May 1990" },
  { id: "2", patient_number: "P00002", full_name: "Andres Bonifacio", dob: "30 Nov 1985" },
  { id: "3", patient_number: "P00003", full_name: "Josefa Llanes", dob: "19 Feb 2011" },
];

const PATIENT_COLUMNS: Column<DemoPatient>[] = [
  { id: "full_name", header: "Name", cell: (p) => p.full_name, sortable: true, card: "title" },
  { id: "patient_number", header: "No.", cell: (p) => p.patient_number, card: "meta" },
  { id: "dob", header: "Date of birth", cell: (p) => p.dob, sortable: true, card: "meta" },
];

/** Fixtures for DuplicateWarning. Invented people, and a fake ack. */
const STAFF_CONFIRM: Confirmable = {
  kind: "duplicate-patient",
  title: "This may already be a patient",
  detail:
    "Open the existing record if this is the same person. Create a separate record only if you are sure it is someone else.",
  existingHref: "/design-system#duplicate-warning",
  proceedLabel: "Create a separate record",
  matches: [
    {
      id: "1",
      patientNumber: "P00001",
      fullName: "Maria Santos",
      reason: "Same email address and date of birth",
      confidence: "certain",
    },
    {
      id: "2",
      patientNumber: "P00042",
      fullName: "Maria Santos-Cruz",
      reason: "Same mobile number",
      confidence: "possible",
    },
  ],
  ack: "0000000000000000000000000000dead",
};

const SELF_CONFIRM: Confirmable = {
  kind: "duplicate-patient",
  title: "Check your details",
  detail: "Please make sure your name and date of birth are correct before continuing.",
  ack: "0000000000000000000000000000beef",
};

/** Fixtures for the lookups layout specimens. Invented rows, never real ones. */
type DemoType = {
  id: string;
  name: string;
  duration: string;
  buffers: string;
  total: string;
  booking: string;
  archived?: boolean;
};

const TYPE_ROWS: DemoType[] = [
  { id: "1", name: "Adult Recall + Prophy", duration: "50 min", buffers: "—", total: "50 min", booking: "Patients + staff" },
  { id: "2", name: "Emergency", duration: "30 min", buffers: "+0 / +10", total: "40 min", booking: "Patients + staff" },
  { id: "3", name: "Crown Prep", duration: "1 h 30 min", buffers: "—", total: "90 min", booking: "Staff only" },
  { id: "4", name: "Teeth whitening", duration: "40 min", buffers: "—", total: "40 min", booking: "Staff only", archived: true },
];

const TYPE_COLUMNS: Column<DemoType>[] = [
  {
    id: "name",
    header: "Name",
    sortable: true,
    card: "title",
    cell: (r) => (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{r.name}</span>
        {r.archived && <RecordChip state="archived" />}
      </span>
    ),
  },
  { id: "duration", header: "Duration", sortable: true, card: "meta", cell: (r) => r.duration },
  { id: "buffers", header: "Buffers", card: "detail", cell: (r) => r.buffers },
  {
    id: "total",
    header: "Total block",
    card: "detail",
    cell: (r) => <span className={r.buffers === "—" ? undefined : "font-medium"}>{r.total}</span>,
  },
  { id: "booking", header: "Booking", card: "meta", cell: (r) => r.booking },
];
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
  /**
   * Imported, not re-declared. This used to duplicate the union inline, which
   * meant adding a group to groups.ts typechecked cleanly while no entry here
   * could actually use it — and groups.ts is what the a11y spec iterates, so
   * the two drifting silently is exactly the failure that file exists to
   * prevent.
   */
  group: GalleryGroup;
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
        name: "Record states",
        note: "RecordChip is a separate vocabulary from StatusChip: 'archived' is a property of the ROW, not of a visit. Neutral tokens — archiving is reversible and routine.",
        render: () => (
          <div className="flex flex-wrap gap-2">
            {RECORD_STATES.map((s) => (
              <RecordChip key={s} state={s} />
            ))}
          </div>
        ),
      },
      {
        name: "Feedback triage statuses",
        note: "A FOURTH vocabulary, separate again: 'Resolved' is a property of a bug report, 'Completed' of a visit. Three attention levels for six statuses means colours repeat - legal, because colour is never the only signal: the label and icon always differ.",
        render: () => (
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_STATUS_KEYS.map((s) => (
              <FeedbackStatusChip key={s} status={s} />
            ))}
          </div>
        ),
      },
      {
        name: "Feedback severities",
        note: "No --destructive here: it is reserved for destructive ACTIONS, and a severity describes a report rather than threatening data. Reporter-set, superadmin-overridable.",
        render: () => (
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_SEVERITY_KEYS.map((s) => (
              <FeedbackSeverityChip key={s} severity={s} />
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
    id: "inline-alert",
    name: "InlineAlert",
    group: "feedback",
    doc: "docs/design-system/04-components/inline-alert.md",
    description: "A message bound to what is on screen. The counterpart to a toast, and the default of the two.",
    specimens: [
      {
        name: "All four tones",
        note: "Icon and announcement role are derived from the tone — never passed in.",
        render: () => (
          <div className="flex flex-col gap-3">
            <InlineAlert tone="info" title="Emails send from a Brevo address">
              <p>
                Replies still reach the clinic inbox. Add a domain to send as your own address.
              </p>
            </InlineAlert>
            <InlineAlert tone="warning" title="This may already be a patient">
              <p>Maria Santos has the same email address and date of birth.</p>
            </InlineAlert>
            <InlineAlert tone="success" title="Brevo accepted the test email">
              <p>Check the inbox — delivery is not the same as acceptance.</p>
            </InlineAlert>
            <InlineAlert tone="danger" title="Couldn&apos;t reach Brevo">
              <p>The request timed out after 10 seconds.</p>
            </InlineAlert>
          </div>
        ),
      },
      {
        name: "Title only",
        render: () => <InlineAlert tone="warning" title="No sending domain is configured yet." />,
      },
    ],
  },
  {
    id: "field",
    name: "Field",
    group: "shared",
    doc: "docs/design-system/04-components/field.md",
    description:
      "Label, control, hint and error wired together once. Owns the 44px / 1rem floor the shadcn input misses.",
    specimens: [
      {
        name: "Text, with hint",
        render: () => (
          <div className="max-w-sm">
            <Field
              name="specimen-email"
              label="Email"
              type="email"
              required
              hint="Used for appointment reminders."
            />
          </div>
        ),
      },
      {
        name: "Invalid",
        note: "aria-invalid on the control AND role=alert on the message — two mechanisms, both required.",
        render: () => (
          <div className="max-w-sm">
            <Field
              name="specimen-dob"
              label="Date of birth"
              type="date"
              required
              error="Date of birth cannot be in the future."
            />
          </div>
        ),
      },
      {
        name: "Select, textarea, checkbox",
        note: "Native controls: they submit with JS off and get the platform picker on mobile.",
        render: () => (
          <div className="flex max-w-sm flex-col gap-4">
            <Field
              name="specimen-sex"
              label="Sex"
              as="select"
              placeholder="Select…"
              options={[
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
                { value: "other", label: "Other" },
                { value: "undisclosed", label: "Prefer not to say" },
              ]}
            />
            <Field name="specimen-address" label="Address" as="textarea" rows={2} />
            <Field
              name="specimen-optin"
              label="Send clinic news and offers"
              as="checkbox"
              hint="You can turn this off at any time."
            />
          </div>
        ),
      },
      {
        name: "Disabled",
        render: () => (
          <div className="max-w-sm">
            <Field name="specimen-smtp" label="SMTP password" disabled hint="Set in Phase 5." />
          </div>
        ),
      },
    ],
  },
  {
    id: "submit-button",
    name: "SubmitButton",
    group: "shared",
    doc: "docs/design-system/04-components/submit-button.md",
    description:
      "Submit control for a server-action form. Spinner and disable-while-pending are enhancement only.",
    specimens: [
      {
        name: "Idle",
        note: "A <form> with NO action: the registry renders inside a Server Component, where action={fn} throws 'Functions cannot be passed directly to Client Components'. useFormStatus outside a submitting form reports not-pending, which is exactly the idle state — the only one a static fixture can show. Live instance: /patients/new.",
        render: () => (
          <form>
            <SubmitButton idleLabel="Create patient" pendingLabel="Saving…" />
          </form>
        ),
      },
      {
        name: "Unavailable",
        note: "disabled is for actions that genuinely cannot run — never for invalid input.",
        render: () => (
          <form>
            <SubmitButton idleLabel="Send test email" pendingLabel="Sending…" disabled />
          </form>
        ),
      },
    ],
  },
  {
    id: "data-table",
    name: "DataTable",
    group: "shared",
    doc: "docs/design-system/04-components/data-table.md",
    description:
      "Server-rendered table, card list on phones. All state in the URL — no TanStack, no client JS.",
    specimens: [
      {
        name: "Populated",
        note: "Resize past md to see the same columns become a card list. Both render; display:none picks one.",
        render: () => (
          <DataTable
            caption="Example roster"
            columns={PATIENT_COLUMNS}
            rows={PATIENT_ROWS}
            rowKey={(p) => p.id}
            baseHref="/design-system"
            params={{}}
            sort={{ by: "full_name", dir: "asc" }}
            page={{ index: 0, size: 25, total: 3 }}
            empty={null}
          />
        ),
      },
      {
        name: "Filtered empty",
        note: "NOT an EmptyState: telling a clinic with 400 patients that it has none is the bug this prevents.",
        render: () => (
          <DataTable
            caption="Example roster"
            columns={PATIENT_COLUMNS}
            rows={[]}
            rowKey={(p) => p.id}
            baseHref="/design-system"
            params={{}}
            page={{ index: 0, size: 25, total: 0 }}
            empty={null}
            filter={{ active: true, label: "“santos”", clearHref: "/design-system" }}
          />
        ),
      },
      {
        name: "Paginated",
        render: () => (
          <DataTable
            caption="Example roster"
            columns={PATIENT_COLUMNS}
            rows={PATIENT_ROWS}
            rowKey={(p) => p.id}
            baseHref="/design-system"
            params={{}}
            page={{ index: 1, size: 25, total: 412 }}
            empty={null}
          />
        ),
      },
      {
        name: "Loading",
        render: () => <DataTableSkeleton rows={3} columns={3} />,
      },
    ],
  },
  {
    id: "soft-delete-menu",
    name: "SoftDeleteMenu",
    group: "shared",
    doc: "docs/design-system/04-components/soft-delete-menu.md",
    description:
      "Archive / Restore for one row. Never 'Delete' — there is no DELETE grant on any table.",
    // No specimens on purpose. Its props are SERVER ACTIONS, and an inline
    // async function cannot cross the server→client boundary — only a real
    // "use server" reference can, which the gallery's eslint rule forbids
    // importing. 07-contributing.md sanctions an empty specimen list with a
    // pointer to the live instance for exactly this case.
    specimens: [],
  },
  {
    id: "toaster",
    name: "Toaster",
    group: "feedback",
    doc: "docs/design-system/04-components/toaster.md",
    description:
      "Transient confirmation for a result you cannot see. Never the only path to an action it offers.",
    specimens: [
      {
        name: "Archive toast with Undo",
        note: "Undo here is a no-op fixture. A toast is a WCAG 2.2.1 time limit, so the live roster also reaches Restore from the archived row.",
        render: () => <ToastSpecimen />,
      },
    ],
  },
  {
    id: "duplicate-warning",
    name: "DuplicateWarning",
    group: "feedback",
    doc: "docs/design-system/04-components/duplicate-warning.md",
    description:
      "The duplicate-patient soft stop. Its two modes are two shapes of Confirmable, not a prop.",
    specimens: [
      {
        name: "Staff mode",
        note: "Matches, a link out, and a way to proceed. The proceed button carries the ack as its own name/value — a hidden input would attach it to every submit.",
        render: () => (
          <form>
            <DuplicateWarning confirm={STAFF_CONFIRM} />
          </form>
        ),
      },
      {
        name: "Self mode",
        note: "No proceedLabel ⇒ no matches, no link, no name, no way to continue. Enumeration-safety is in the type: the unsafe rendering is unreachable unless the action declared staff mode.",
        render: () => (
          <form>
            <DuplicateWarning confirm={SELF_CONFIRM} />
          </form>
        ),
      },
    ],
  },
  {
    id: "search-field",
    name: "SearchField",
    group: "search",
    doc: "docs/design-system/04-components/search-field.md",
    description: "GET-form list filter. The query lives in the URL, so results are shareable and back-navigable.",
    specimens: [
      {
        name: "Empty",
        render: () => (
          <div className="max-w-md">
            <SearchField action="/design-system" label="Search the example roster" placeholder="Search patients…" />
          </div>
        ),
      },
      {
        name: "With a query",
        note: "Clear is a link to the unfiltered URL, so it works without JavaScript.",
        render: () => (
          <div className="max-w-md">
            <SearchField
              action="/design-system"
              label="Search the example roster"
              placeholder="Search patients…"
              defaultValue="santos"
            />
          </div>
        ),
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

  // ---------------------------------------------------------------------
  // Layouts — whole-page compositions. See GROUP_LABELS.layouts for what
  // this group does and does not prove.
  // ---------------------------------------------------------------------
  {
    id: "admin-hub",
    name: "AdminSectionGrid",
    group: "layouts",
    doc: "docs/design-system/04-components/admin-hub.md",
    description:
      "The /admin landing grid. Renders the REAL section list, not a fixture — so a section added without an href is proven here to be non-clickable rather than shipping as a 404.",
    specimens: [
      {
        name: "Clinic settings hub",
        note: "Branding is live; the rest state when they arrive, in words rather than by being greyed out.",
        render: () => <AdminSectionGrid sections={ADMIN_SECTIONS} />,
      },
    ],
  },
  {
    id: "branding-form",
    name: "BrandingForm",
    group: "layouts",
    doc: "docs/design-system/04-components/branding-form.md",
    description:
      "The /admin/branding editor. The logo picker sits outside the <form> on purpose — a file input inside a Server Action form is serialized into the action payload and hits the 1 MB body limit.",
    specimens: [
      {
        name: "Idle",
        note: "The picker renders disabled: a specimen may not import a server action, so there is no minter.",
        render: () => <BrandingFormSpecimen />,
      },
      {
        name: "Field errors",
        render: () => <BrandingFormSpecimen state="invalid" />,
      },
      {
        name: "Saved",
        render: () => <BrandingFormSpecimen state="success" />,
      },
    ],
  },
  {
    id: "lookup-list",
    name: "Lookups list screen",
    group: "layouts",
    doc: "docs/modules/02-clinic-settings.md",
    description:
      "The shape every /admin/lookups list shares: PageHeader, ListToolbar, DataTable. Row menus are omitted — SoftDeleteMenu's props are server actions, which a specimen may not import.",
    specimens: [
      {
        name: "Appointment types",
        note: "Includes an archived row. The Total block column is the point: buffers are invisible everywhere else.",
        render: () => (
          <div>
            <PageHeader
              title="Appointment types"
              description="What can be booked, how long it takes, and the chair time around it."
            />
            <ListToolbar
              action="/design-system"
              searchLabel="Search appointment types"
              searchPlaceholder="Name"
              query=""
              archived={false}
              activeHref="/design-system#lookup-list"
              archivedHref="/design-system#lookup-list"
              archivedNotice="Nothing here is deleted."
            />
            <div className="mt-4">
              <DataTable
                columns={TYPE_COLUMNS}
                rows={TYPE_ROWS}
                rowKey={(r) => r.id}
                caption="Appointment types"
                baseHref="/design-system"
                params={{}}
                sort={{ by: "name", dir: "asc" }}
                page={{ index: 0, size: 25, total: TYPE_ROWS.length }}
                empty={<EmptyState register="first-use" icon={CalendarClock} title="None yet" />}
              />
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: "lookup-form",
    name: "Lookups form screen",
    group: "layouts",
    doc: "docs/modules/02-clinic-settings.md",
    description:
      "AppointmentTypeFields inside a plain <form> with no action. Seeded with an invalid duration so the 10-minute rejection message goes through the whole matrix.",
    specimens: [
      {
        name: "With a rejected duration",
        note: "Non-multiples of 10 are rejected, never rounded — a schedule five minutes wrong per appointment with nobody told is the worse outcome.",
        render: () => (
          <div>
            <PageHeader
              title="Add appointment type"
              description="Durations are in 10-minute steps, because the scheduler works on a 10-minute grid."
            />
            {/* No `action` prop: a function cannot cross the Server Component
                boundary, and a specimen may not import one anyway. */}
            <form noValidate className="mt-6 flex flex-col gap-6">
              <AppointmentTypeFields
                values={{
                  name: "Teeth whitening",
                  duration_minutes: "45",
                  pre_buffer_minutes: "0",
                  post_buffer_minutes: "10",
                  patient_bookable: "",
                  color: "violet",
                  sort_order: "100",
                }}
                errors={{ duration_minutes: "Duration must be in 10-minute steps — try 40 or 50." }}
              />
              <div>
                <SubmitButton idleLabel="Add type" pendingLabel="Saving…" />
              </div>
            </form>
          </div>
        ),
      },
    ],
  },
  {
    id: "profile-screen",
    name: "Profile screen",
    group: "layouts",
    doc: "docs/modules/03-patients.md",
    description:
      "The /profile composition: the always-present account summary, then the editable details. Email is read-only text rather than a disabled input — changing it belongs to the verified sign-in flow.",
    specimens: [
      {
        name: "Patient with a record",
        render: () => (
          <div>
            <PageHeader title="Profile" description="Your account and the details the clinic holds." />
            <section aria-labelledby="specimen-account" className="flex flex-col gap-3">
              <h2 id="specimen-account" className="text-base font-medium text-foreground">
                Your account
              </h2>
              <dl className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-border sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">Email address</dt>
                  <dd className="text-base break-words text-foreground">maria.santos@example.com</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Role</dt>
                  <dd className="text-base text-foreground">Patient</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Patient number</dt>
                  <dd className="text-base text-foreground">P00001</dd>
                </div>
              </dl>
            </section>
            <form noValidate className="mt-6 flex flex-col gap-6">
              <ProfileFields
                values={{
                  first_name: "Maria",
                  last_name: "Santos",
                  dob: "1990-05-04",
                  phone: "0917 123 4567",
                  sex: "female",
                  address: "12 Mabini St, Quezon City",
                  marketing_opt_in: "on",
                }}
                errors={{}}
              />
              <div>
                <SubmitButton idleLabel="Save my details" pendingLabel="Saving…" />
              </div>
            </form>
          </div>
        ),
      },
    ],
  },
  {
    id: "feedback-form",
    name: "Report a problem screen",
    group: "layouts",
    doc: "docs/modules/16-feedback.md",
    description:
      "The /feedback composition. The screen the reporter came from is captured automatically and stored MASKED (/patients/[id], never a real id) - the notice says so, because a form that silently records where you were is worse than one that tells you.",
    specimens: [
      {
        name: "Filing from a patient chart",
        note: "The notice is rule 1 made visible: it names the masked pattern that will be stored, so nobody has to take the masking on trust.",
        render: () => (
          <div>
            <PageHeader
              title="Report a problem"
              description="Tell the clinic administrator what went wrong, or suggest something that would work better."
            />
            <div className="mt-4">
              <InlineAlert tone="info" title="Reporting about a screen you were just on">
                <p>
                  This report will be tagged <code className="font-mono">/patients/[id]</code>. Only
                  the screen is recorded, never which record you were viewing.
                </p>
              </InlineAlert>
            </div>
            <form noValidate className="mt-6 flex flex-col gap-6">
              <FeedbackFields
                values={{
                  kind: "bug",
                  severity: "major",
                  title: "Saving a new patient does nothing",
                  body: "Pressed Create patient on the 10:30 appointment and the button spun, then the form came back empty.",
                }}
                errors={{}}
              />
              <div>
                <SubmitButton idleLabel="Send report" pendingLabel="Sending..." />
              </div>
            </form>
          </div>
        ),
      },
      {
        name: "With a rejected field",
        note: "`invalid` renders at the field, never as a banner - it is the user's to fix.",
        render: () => (
          <div>
            <PageHeader title="Report a problem" />
            <form noValidate className="mt-6 flex flex-col gap-6">
              <FeedbackFields
                values={{ kind: "idea", severity: "minor", title: "", body: "It would help if..." }}
                errors={{ title: "A short summary is required." }}
              />
              <div>
                <SubmitButton idleLabel="Send report" pendingLabel="Sending..." />
              </div>
            </form>
          </div>
        ),
      },
    ],
  },
  {
    id: "feedback-triage",
    name: "Feedback triage screen",
    group: "layouts",
    doc: "docs/modules/16-feedback.md",
    description:
      "The /admin/feedback/[id] composition. The report itself is static text because the database pins it: title, body, path, kind and the reporter are immutable after filing, so only status, severity and the triage note have controls.",
    specimens: [
      {
        name: "A new report being triaged",
        render: () => (
          <div>
            <PageHeader
              title="Saving a new patient does nothing"
              description="Something is broken, reported by a staff."
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <FeedbackStatusChip status="new" />
              <FeedbackSeverityChip severity="major" />
            </div>
            <section aria-labelledby="specimen-report-body" className="mt-6">
              <h2 id="specimen-report-body" className="text-lg font-semibold text-foreground">
                What was reported
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-base text-foreground">
                Pressed Create patient on the 10:30 appointment and the button spun, then the form
                came back empty.
              </p>
            </section>
            <section aria-labelledby="specimen-report-context" className="mt-6">
              <h2 id="specimen-report-context" className="text-lg font-semibold text-foreground">
                Context
              </h2>
              <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">Screen</dt>
                  <dd className="mt-0.5 font-mono text-sm text-foreground">/patients/new</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Screen size</dt>
                  <dd className="mt-0.5 text-foreground">390x844</dd>
                </div>
              </dl>
            </section>
            <section aria-labelledby="specimen-report-triage" className="mt-8">
              <h2 id="specimen-report-triage" className="text-lg font-semibold text-foreground">
                Triage
              </h2>
              <form noValidate className="mt-6 flex flex-col gap-6">
                <TriageFields
                  values={{ status: "triaged", severity: "major", triage_note: "" }}
                  errors={{}}
                />
                <div>
                  <SubmitButton idleLabel="Save triage" pendingLabel="Saving..." />
                </div>
              </form>
            </section>
          </div>
        ),
      },
    ],
  },
];
