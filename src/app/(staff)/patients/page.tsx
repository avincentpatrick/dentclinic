import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { archivePatient, restorePatient } from "@/app/actions/patients";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { DataTableSkeleton } from "@/components/shared/DataTable.skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { RecordChip } from "@/components/shared/StatusChip";
import { SearchField } from "@/components/shared/SearchField";
import { SoftDeleteMenu } from "@/components/shared/SoftDeleteMenu";
import { ToastOnMount } from "@/components/shared/ToastOnMount";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { logRead } from "@/lib/audit/log-read";
import { createClient } from "@/lib/supabase/server";
import { formatDob } from "@/lib/patients/format";
import {
  PAGE_SIZE,
  parseArchived,
  parseDir,
  parsePage,
  parseQuery,
  parseSort,
  rosterHref,
  rosterParams,
  searchFilter,
  type SortDir,
  type SortKey,
} from "@/lib/patients/query";

export const metadata: Metadata = { title: "Patients" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RosterRow = {
  id: string;
  patient_number: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  is_provisional: boolean;
  deleted_at: string | null;
};

/**
 * NOTE: there is deliberately no `loading.tsx` under /patients.
 *
 * Without Cache Components a dynamic route is not prefetched AT ALL unless it
 * has a loading boundary. Adding one here would make all 25 row links
 * prefetchable — 25 RSC requests per roster view, each running middleware and
 * auth.getClaims() — and would put the read-audit's correctness on the
 * framework-internal promise that a prefetch never renders a page body. The
 * Suspense boundary below buys the same perceived speed with none of that.
 * See src/lib/audit/log-read.ts.
 */
export default async function Page({ searchParams }: PageProps<"/patients">) {
  const sp = await searchParams;

  const state = {
    q: parseQuery(sp.q),
    sort: parseSort(sp.sort),
    dir: parseDir(sp.dir),
    archived: parseArchived(sp.archived),
  };
  const page = parsePage(sp.page);
  // `undo` carries a bare UUID and nothing else — no name, no patient number.
  // That is the same exposure class as /patients/<id>, which already exists,
  // and forms.md forbids PHI in a query string. The param is `undo` rather than
  // `archived` because `?archived=1` is the roster's own filter.
  const undoId = typeof sp.undo === "string" && UUID_RE.test(sp.undo) ? sp.undo : undefined;

  return (
    <>
      <PageHeader
        title="Patients"
        description="The clinic patient roster."
        actions={
          <Button asChild className="min-h-11">
            <Link href="/patients/new">Add patient</Link>
          </Button>
        }
      />

      {undoId && (
        <ToastOnMount
          token={undoId}
          title="Patient archived"
          description="The record is out of the active list. Nothing was deleted."
          actionLabel="Undo"
          undoPatientId={undoId}
        />
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          {/* SearchField reads useSearchParams; the Suspense boundary keeps that
              out of the page's own render path. */}
          <Suspense fallback={<div className="h-11" />}>
            <SearchField
              action="/patients"
              label="Search patients"
              placeholder="Name, number, email or phone"
              defaultValue={state.q}
            />
          </Suspense>
        </div>
        <nav aria-label="Record status" className="flex shrink-0 gap-1">
          <FilterLink
            href={rosterHref({ ...state, archived: false })}
            current={!state.archived}
            label="Active"
          />
          <FilterLink
            href={rosterHref({ ...state, archived: true })}
            current={state.archived}
            label="Archived"
          />
        </nav>
      </div>

      {state.archived && (
        <div className="mt-4">
          <InlineAlert tone="info" title="Showing archived patients">
            <p>Nothing here is deleted. Restore a record from its row menu.</p>
          </InlineAlert>
        </div>
      )}

      <div className="mt-4">
        <Suspense
          key={`${state.q}|${state.sort}|${state.dir}|${state.archived}|${page}`}
          fallback={<DataTableSkeleton rows={8} columns={5} />}
        >
          <Roster state={state} page={page} />
        </Suspense>
      </div>
    </>
  );
}

function FilterLink({ href, current, label }: { href: string; current: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        current
          ? "inline-flex min-h-11 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground"
          : "inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
      }
    >
      {label}
    </Link>
  );
}

async function Roster({
  state,
  page,
}: {
  state: { q: string; sort: SortKey; dir: SortDir; archived: boolean };
  page: number;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("patients")
    .select(
      "id, patient_number, full_name, email, phone, dob, is_provisional, deleted_at",
      { count: "exact" },
    );

  // NOT OPTIONAL. Staff hold two permissive SELECT policies — one for live rows
  // and the named "Archive view" one for archived rows — and permissive policies
  // OR together, so the practical grant is EVERY row. The active/archived split
  // is an application filter; omitting it silently mixes archived patients back
  // into the working roster.
  query = state.archived
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);

  const filter = searchFilter(state.q);
  if (filter) query = query.or(filter);

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query
    .order(state.sort, { ascending: state.dir === "asc", nullsFirst: false })
    // Stable tiebreak. Without it two rows sorting equal (two Maria Santoses, or
    // any two null dobs) can appear on both pages or on neither.
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1)
    .returns<RosterRow[]>();

  // One audit row per roster render — "who pulled up the roster, and when".
  await logRead("patients");

  if (error) {
    return (
      <EmptyState
        register="error"
        title="Couldn't load the roster"
        description="The record list is temporarily unavailable. Try again in a moment."
        action={{ label: "Retry", href: rosterHref({ ...state, page }) }}
      />
    );
  }

  const rows = data ?? [];
  const returnTo = rosterHref({ ...state, page });

  const columns: Column<RosterRow>[] = [
    {
      id: "full_name",
      header: "Name",
      sortable: true,
      card: "title",
      cell: (p) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          {p.full_name ?? "—"}
          {p.deleted_at && <RecordChip state="archived" size="sm" />}
          {!p.deleted_at && p.is_provisional && <RecordChip state="provisional" size="sm" />}
        </span>
      ),
    },
    { id: "patient_number", header: "No.", card: "meta", cell: (p) => p.patient_number },
    { id: "dob", header: "Date of birth", sortable: true, card: "meta", cell: (p) => formatDob(p.dob) },
    { id: "phone", header: "Phone", card: "meta", cell: (p) => p.phone ?? "—" },
    {
      id: "email",
      header: "Email",
      card: "hidden",
      className: "hidden lg:table-cell",
      cell: (p) => p.email ?? "—",
    },
  ];

  return (
    <DataTable
      caption={state.archived ? "Archived patients" : "Patient roster"}
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      href={(p) => `/patients/${p.id}`}
      baseHref="/patients"
      // sort and dir MUST be here: DataTable's pagination patch only sets
      // `page`, so anything missing from params is dropped on Next/Previous.
      params={rosterParams(state)}
      sort={{ by: state.sort, dir: state.dir }}
      page={{ index: page - 1, size: PAGE_SIZE, total: count ?? 0 }}
      filter={{
        active: Boolean(state.q),
        label: `“${state.q}”`,
        clearHref: rosterHref({ ...state, q: "" }),
      }}
      empty={
        state.archived ? (
          <EmptyState
            register="cleared"
            title="Nothing archived"
            description="Archived patient records appear here."
          />
        ) : (
          <EmptyState
            register="first-use"
            icon={Users}
            title="No patients yet"
            description="Add the first record, or wait for a patient to register themselves."
            action={{ label: "Add patient", href: "/patients/new" }}
          />
        )
      }
      rowActions={(p) => (
        <SoftDeleteMenu
          label={p.full_name ?? p.patient_number}
          archived={Boolean(p.deleted_at)}
          archiveAction={archivePatient.bind(null, p.id, returnTo)}
          restoreAction={restorePatient.bind(null, p.id, returnTo)}
        />
      )}
    />
  );
}
