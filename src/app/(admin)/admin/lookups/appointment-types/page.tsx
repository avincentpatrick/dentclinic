import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { ListToolbar } from "@/components/lookups/ListToolbar";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { DataTableSkeleton } from "@/components/shared/DataTable.skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { RecordChip } from "@/components/shared/StatusChip";
import { SoftDeleteMenu } from "@/components/shared/SoftDeleteMenu";
import { Button } from "@/components/ui/button";
import { archiveLookup, restoreLookup } from "@/app/actions/lookups";
import { createClient } from "@/lib/supabase/server";
import {
  PAGE_SIZE,
  lookupsHref,
  lookupsParams,
  nameLike,
  parseAppointmentTypeSort,
  parseArchived,
  parseDir,
  parsePage,
  parseQuery,
  type SortDir,
} from "@/lib/lookups/query";
import { formatBuffers, formatMinutes, hasBuffers, totalBlockMinutes } from "@/lib/lookups/format";

export const metadata: Metadata = { title: "Appointment types" };

const BASE = "/admin/lookups/appointment-types";

/**
 * No `loading.tsx`, and for a DIFFERENT reason than `/patients`.
 *
 * The roster's argument is about the read audit — a prefetch would fire 25 RSC
 * requests and muddy `log_read`. That does not transfer: lookups are clinic
 * configuration, not PHI, and are deliberately not read-audited.
 *
 * The reason here is simpler. Adding a `loading.tsx` makes the route
 * prefetchable, so hovering nine rows fires nine RSC requests, each running
 * middleware and `auth.getClaims()`, to render a list that comes back in one
 * query. Streaming inside the page via `<Suspense>` gives the same perceived
 * speed for none of that.
 */
export default async function AppointmentTypesPage(props: PageProps<"/admin/lookups/appointment-types">) {
  const sp = await props.searchParams;
  const state = {
    q: parseQuery(sp.q),
    sort: parseAppointmentTypeSort(sp.sort),
    dir: parseDir(sp.dir),
    archived: parseArchived(sp.archived),
  };
  const page = parsePage(sp.page);

  return (
    <>
      <PageHeader
        title="Appointment types"
        description="What can be booked, how long it takes, and the chair time around it."
        actions={
          <Button asChild className="min-h-11">
            <Link href={`${BASE}/new`}>Add type</Link>
          </Button>
        }
      />

      <ListToolbar
        action={BASE}
        searchLabel="Search appointment types"
        searchPlaceholder="Name"
        query={state.q}
        archived={state.archived}
        activeHref={lookupsHref(BASE, { ...state, archived: false })}
        archivedHref={lookupsHref(BASE, { ...state, archived: true })}
        archivedNotice="Nothing here is deleted. Restore a type from its row menu; existing appointments keep theirs."
      />

      <div className="mt-4">
        <Suspense
          key={`${state.q}|${state.sort}|${state.dir}|${state.archived}|${page}`}
          fallback={<DataTableSkeleton rows={8} columns={6} />}
        >
          <TypesTable state={state} page={page} />
        </Suspense>
      </div>
    </>
  );
}

type Row = {
  id: string;
  name: string;
  duration_units: number;
  pre_buffer_units: number;
  post_buffer_units: number;
  patient_bookable: boolean;
  color: string;
  sort_order: number;
  deleted_at: string | null;
};

async function TypesTable({
  state,
  page,
}: {
  state: { q: string; sort: string; dir: SortDir; archived: boolean };
  page: number;
}) {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("appointment_types")
    .select(
      "id, name, duration_units, pre_buffer_units, post_buffer_units, patient_bookable, color, sort_order, deleted_at",
      { count: "exact" },
    );

  // Explicit, and NOT optional: permissive RLS policies OR together, so the
  // superadmin archived-read policy would otherwise leak archived rows into the
  // active list.
  query = state.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

  const like = nameLike(state.q);
  if (like) query = query.ilike("name", like);

  const { data, count, error } = await query
    .order(state.sort, { ascending: state.dir === "asc" })
    .order("id", { ascending: true }) // stable tiebreak, so paging never repeats a row
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    return (
      <EmptyState
        register="error"
        icon={CalendarClock}
        title="Couldn't load appointment types"
        description="Try again in a moment."
      />
    );
  }

  const rows = (data ?? []) as Row[];
  const returnTo = lookupsHref(BASE, { ...state, page });

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      card: "title",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{r.name}</span>
          {r.deleted_at && <RecordChip state="archived" />}
        </span>
      ),
    },
    {
      id: "duration_units",
      header: "Duration",
      sortable: true,
      card: "meta",
      cell: (r) => formatMinutes(r.duration_units),
    },
    {
      id: "buffers",
      header: "Buffers",
      card: "detail",
      cell: (r) => (hasBuffers(r) ? formatBuffers(r) : "—"),
    },
    {
      id: "total",
      header: "Total block",
      card: "detail",
      // The point of this table. Buffers never appear on a patient's
      // confirmation and are not part of the duration, so this is the only
      // place a clinic sees that "Emergency, 30 min" occupies 40 minutes.
      cell: (r) => (
        <span className={hasBuffers(r) ? "font-medium" : undefined}>
          {totalBlockMinutes(r)} min
        </span>
      ),
    },
    {
      id: "patient_bookable",
      header: "Booking",
      card: "meta",
      // Words, never colour alone (WCAG 1.4.1).
      cell: (r) => (r.patient_bookable ? "Patients + staff" : "Staff only"),
    },
    {
      id: "sort_order",
      header: "Order",
      sortable: true,
      align: "end",
      card: "hidden",
      cell: (r) => r.sort_order,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      href={(r) => `${BASE}/${r.id}`}
      caption="Appointment types"
      baseHref={BASE}
      params={lookupsParams(state)}
      sort={{ by: state.sort, dir: state.dir }}
      page={{ index: page - 1, size: PAGE_SIZE, total: count ?? 0 }}
      filter={
        state.q
          ? {
              active: true,
              label: `No appointment types match “${state.q}”.`,
              clearHref: lookupsHref(BASE, { ...state, q: "" }),
            }
          : undefined
      }
      empty={
        <EmptyState
          register={state.archived ? "cleared" : "first-use"}
          icon={CalendarClock}
          title={state.archived ? "Nothing archived" : "No appointment types yet"}
          description={
            state.archived
              ? "Archived types will appear here."
              : "Add the treatments this clinic books, with how long each one takes."
          }
          action={state.archived ? undefined : { label: "Add type", href: `${BASE}/new` }}
        />
      }
      rowActions={(r) => (
        <SoftDeleteMenu
          label={r.name}
          archived={Boolean(r.deleted_at)}
          archiveAction={archiveLookup.bind(null, "appointment_types", r.id, returnTo)}
          restoreAction={restoreLookup.bind(null, "appointment_types", r.id, returnTo)}
        />
      )}
    />
  );
}
