import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Tag } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { ListToolbar } from "@/components/lookups/ListToolbar";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { DataTableSkeleton } from "@/components/shared/DataTable.skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { RecordChip } from "@/components/shared/StatusChip";
import { SoftDeleteMenu } from "@/components/shared/SoftDeleteMenu";
import { Button } from "@/components/ui/button";
import { archiveLookup, restoreLookup } from "@/app/actions/lookups";
import { getBranding } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { getCategoryByKey, type LookupCategory } from "@/lib/lookups/read";
import { formatAmount } from "@/lib/lookups/format";
import {
  PAGE_SIZE,
  RESERVED_LOOKUP_SLUGS,
  lookupsHref,
  lookupsParams,
  nameLike,
  parseArchived,
  parseDir,
  parseLookupValueSort,
  parsePage,
  parseQuery,
  slugToKey,
  type SortDir,
} from "@/lib/lookups/query";

/**
 * One screen for every generic lookup category.
 *
 * Dynamic on purpose: a category seeded in a future migration gets a working
 * admin screen with no route work at all. Next resolves the static
 * `appointment-types` and `operatories` segments before this one, but the
 * reserved-slug guard below makes that explicit rather than relying on it —
 * otherwise a category keyed `operatories` would render something confusing
 * instead of a 404.
 */
export async function generateMetadata(
  props: PageProps<"/admin/lookups/[category]">,
): Promise<Metadata> {
  const { category } = await props.params;
  const found = await getCategoryByKey(slugToKey(category));
  return { title: found?.label ?? "Lookups" };
}

async function resolveCategory(slug: string): Promise<LookupCategory> {
  if ((RESERVED_LOOKUP_SLUGS as readonly string[]).includes(slug)) notFound();
  const category = await getCategoryByKey(slugToKey(slug));
  if (!category) notFound();
  return category;
}

export default async function LookupCategoryPage(props: PageProps<"/admin/lookups/[category]">) {
  const { category: slug } = await props.params;
  const category = await resolveCategory(slug);

  const sp = await props.searchParams;
  const state = {
    q: parseQuery(sp.q),
    sort: parseLookupValueSort(sp.sort),
    dir: parseDir(sp.dir),
    archived: parseArchived(sp.archived),
  };
  const page = parsePage(sp.page);
  const base = `/admin/lookups/${slug}`;

  return (
    <>
      <PageHeader
        title={category.label}
        description={category.description ?? undefined}
        actions={
          <Button asChild className="min-h-11">
            <Link href={`${base}/new`}>Add entry</Link>
          </Button>
        }
      />

      {category.value_kind === "money" && (
        <InlineAlert tone="info" title="These are starting prices">
          <p>
            Set them to this clinic&rsquo;s real prices before invoicing begins. An amount is copied
            onto an invoice line when it is added, so changing it later never rewrites an invoice
            that has already been issued.
          </p>
        </InlineAlert>
      )}

      <ListToolbar
        action={base}
        searchLabel={`Search ${category.label.toLowerCase()}`}
        searchPlaceholder="Label"
        query={state.q}
        archived={state.archived}
        activeHref={lookupsHref(base, { ...state, archived: false })}
        archivedHref={lookupsHref(base, { ...state, archived: true })}
        archivedNotice="Nothing here is deleted. Restore an entry from its row menu."
      />

      <div className="mt-4">
        <Suspense
          key={`${state.q}|${state.sort}|${state.dir}|${state.archived}|${page}`}
          fallback={<DataTableSkeleton rows={8} columns={4} />}
        >
          <ValuesTable category={category} slug={slug} state={state} page={page} />
        </Suspense>
      </div>
    </>
  );
}

type Row = {
  id: string;
  label: string;
  code: string | null;
  amount: number | null;
  sort_order: number;
  is_system: boolean;
  deleted_at: string | null;
};

async function ValuesTable({
  category,
  slug,
  state,
  page,
}: {
  category: LookupCategory;
  slug: string;
  state: { q: string; sort: string; dir: SortDir; archived: boolean };
  page: number;
}) {
  const supabase = await createClient();
  const branding = await getBranding();
  const base = `/admin/lookups/${slug}`;
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("lookup_values")
    .select("id, label, code, amount, sort_order, is_system, deleted_at", { count: "exact" })
    .eq("category_id", category.id);

  query = state.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

  const like = nameLike(state.q);
  if (like) query = query.ilike("label", like);

  const { data, count, error } = await query
    .order(state.sort, { ascending: state.dir === "asc" })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    return (
      <EmptyState
        register="error"
        icon={Tag}
        title={`Couldn't load ${category.label.toLowerCase()}`}
        description="Try again in a moment."
      />
    );
  }

  const rows = (data ?? []) as Row[];
  const returnTo = lookupsHref(base, { ...state, page });

  const columns: Column<Row>[] = [
    {
      id: "label",
      header: "Label",
      sortable: true,
      card: "title",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{r.label}</span>
          {r.deleted_at && <RecordChip state="archived" />}
        </span>
      ),
    },
    ...(category.value_kind === "money"
      ? [
          {
            id: "amount",
            header: "Amount",
            sortable: true,
            align: "end" as const,
            card: "meta" as const,
            cell: (r: Row) => formatAmount(r.amount, branding.currency),
          },
        ]
      : []),
    {
      id: "code",
      header: "Code",
      sortable: true,
      card: "detail",
      cell: (r) => (
        <span className="text-muted-foreground">{r.code ?? "—"}</span>
      ),
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
      href={(r) => `${base}/${r.id}`}
      caption={category.label}
      baseHref={base}
      params={lookupsParams(state)}
      sort={{ by: state.sort, dir: state.dir }}
      page={{ index: page - 1, size: PAGE_SIZE, total: count ?? 0 }}
      filter={
        state.q
          ? {
              active: true,
              label: `Nothing matches “${state.q}”.`,
              clearHref: lookupsHref(base, { ...state, q: "" }),
            }
          : undefined
      }
      empty={
        <EmptyState
          register={state.archived ? "cleared" : "first-use"}
          icon={Tag}
          title={state.archived ? "Nothing archived" : `No ${category.label.toLowerCase()} yet`}
          description={
            state.archived
              ? "Archived entries will appear here."
              : "Add the first one — it will appear wherever the app offers this list."
          }
          action={state.archived ? undefined : { label: "Add entry", href: `${base}/new` }}
        />
      }
      rowActions={(r) =>
        r.is_system ? (
          // Built-in rows are read by name somewhere in the code — Phase 4.2
          // derives the no-show metric from a specific cancel reason, and every
          // picker needs an "Other". The database refuses to archive them
          // (lookup_values_system_not_archivable); this says so before the user
          // tries. `rowActions` returns ReactNode, so no component change.
          <span className="text-xs text-muted-foreground">Built-in</span>
        ) : (
          <SoftDeleteMenu
            label={r.label}
            archived={Boolean(r.deleted_at)}
            archiveAction={archiveLookup.bind(null, "lookup_values", r.id, returnTo)}
            restoreAction={restoreLookup.bind(null, "lookup_values", r.id, returnTo)}
          />
        )
      }
    />
  );
}
