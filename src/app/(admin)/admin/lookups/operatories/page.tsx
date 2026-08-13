import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DoorOpen } from "lucide-react";
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
  parseArchived,
  parseDir,
  parseOperatorySort,
  parsePage,
  parseQuery,
  type SortDir,
} from "@/lib/lookups/query";

export const metadata: Metadata = { title: "Treatment rooms" };

const BASE = "/admin/lookups/operatories";

export default async function OperatoriesPage(props: PageProps<"/admin/lookups/operatories">) {
  const sp = await props.searchParams;
  const state = {
    q: parseQuery(sp.q),
    sort: parseOperatorySort(sp.sort),
    dir: parseDir(sp.dir),
    archived: parseArchived(sp.archived),
  };
  const page = parsePage(sp.page);

  return (
    <>
      <PageHeader
        title="Treatment rooms"
        description="The chairs appointments are booked into."
        actions={
          <Button asChild className="min-h-11">
            <Link href={`${BASE}/new`}>Add room</Link>
          </Button>
        }
      />

      <ListToolbar
        action={BASE}
        searchLabel="Search treatment rooms"
        searchPlaceholder="Name"
        query={state.q}
        archived={state.archived}
        activeHref={lookupsHref(BASE, { ...state, archived: false })}
        archivedHref={lookupsHref(BASE, { ...state, archived: true })}
        archivedNotice="Nothing here is deleted. Archiving a room stops the calendar offering it; its past appointments stay readable."
      />

      <div className="mt-4">
        <Suspense
          key={`${state.q}|${state.sort}|${state.dir}|${state.archived}|${page}`}
          fallback={<DataTableSkeleton rows={4} columns={4} />}
        >
          <OperatoriesTable state={state} page={page} />
        </Suspense>
      </div>
    </>
  );
}

type Row = {
  id: string;
  name: string;
  sort_order: number;
  is_hygiene: boolean;
  deleted_at: string | null;
  providers: { display_name: string } | null;
};

async function OperatoriesTable({
  state,
  page,
}: {
  state: { q: string; sort: string; dir: SortDir; archived: boolean };
  page: number;
}) {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("operatories")
    // PostgREST embed: one round trip rather than a second query per row.
    .select("id, name, sort_order, is_hygiene, deleted_at, providers:default_provider_id(display_name)", {
      count: "exact",
    });

  query = state.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

  const like = nameLike(state.q);
  if (like) query = query.ilike("name", like);

  const { data, count, error } = await query
    .order(state.sort, { ascending: state.dir === "asc" })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    return (
      <EmptyState
        register="error"
        icon={DoorOpen}
        title="Couldn't load treatment rooms"
        description="Try again in a moment."
      />
    );
  }

  const rows = (data ?? []) as unknown as Row[];
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
      id: "is_hygiene",
      header: "Use",
      card: "meta",
      cell: (r) => (r.is_hygiene ? "Hygiene" : "General"),
    },
    {
      id: "provider",
      header: "Usual provider",
      card: "detail",
      cell: (r) => r.providers?.display_name ?? "—",
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
      caption="Treatment rooms"
      baseHref={BASE}
      params={lookupsParams(state)}
      sort={{ by: state.sort, dir: state.dir }}
      page={{ index: page - 1, size: PAGE_SIZE, total: count ?? 0 }}
      filter={
        state.q
          ? {
              active: true,
              label: `No treatment rooms match “${state.q}”.`,
              clearHref: lookupsHref(BASE, { ...state, q: "" }),
            }
          : undefined
      }
      empty={
        <EmptyState
          register={state.archived ? "cleared" : "first-use"}
          icon={DoorOpen}
          title={state.archived ? "Nothing archived" : "No treatment rooms yet"}
          description={
            state.archived
              ? "Archived rooms will appear here."
              : "Add each chair the clinic books into. The calendar shows one column per room."
          }
          action={state.archived ? undefined : { label: "Add room", href: `${BASE}/new` }}
        />
      }
      rowActions={(r) => (
        <SoftDeleteMenu
          label={r.name}
          archived={Boolean(r.deleted_at)}
          archiveAction={archiveLookup.bind(null, "operatories", r.id, returnTo)}
          restoreAction={restoreLookup.bind(null, "operatories", r.id, returnTo)}
        />
      )}
    />
  );
}
