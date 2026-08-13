import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { ListToolbar } from "@/components/lookups/ListToolbar";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { DataTableSkeleton } from "@/components/shared/DataTable.skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  FeedbackSeverityChip,
  FeedbackStatusChip,
  RecordChip,
} from "@/components/shared/StatusChip";
import { SoftDeleteMenu } from "@/components/shared/SoftDeleteMenu";
import { ToastOnMount } from "@/components/shared/ToastOnMount";
import { cn } from "@/lib/utils";
import { archiveReport, restoreReport, restoreReportById } from "@/app/actions/feedback";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABELS, STATUS_LABELS, FEEDBACK_STATUSES } from "@/lib/feedback/schema";
import type { FeedbackRow } from "@/lib/feedback/read";
import {
  PAGE_SIZE,
  DEFAULT_DIR,
  feedbackHref,
  feedbackParams,
  parseArchived,
  parseDir,
  parseFeedbackSort,
  parsePage,
  parseQuery,
  parseStatusFilter,
  titleLike,
  type FeedbackListState,
} from "@/lib/feedback/query";

export const metadata: Metadata = { title: "Feedback" };

const BASE = "/admin/feedback";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FeedbackAdminPage(props: PageProps<"/admin/feedback">) {
  const sp = await props.searchParams;
  const state: FeedbackListState = {
    q: parseQuery(sp.q),
    sort: parseFeedbackSort(sp.sort),
    dir: sp.dir === undefined ? DEFAULT_DIR : parseDir(sp.dir),
    archived: parseArchived(sp.archived),
    status: parseStatusFilter(sp.status),
  };
  const page = parsePage(sp.page);
  const undoId = typeof sp.undo === "string" && UUID_RE.test(sp.undo) ? sp.undo : undefined;

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Bug reports and suggestions filed by anyone using the system. Nothing here was emailed to you — this queue is the notification."
      />

      {undoId && (
        <ToastOnMount
          token={undoId}
          title="Report archived"
          description="It is out of the active queue. Nothing was deleted."
          actionLabel="Undo"
          onUndo={restoreReportById.bind(null, undoId)}
        />
      )}

      <ListToolbar
        action={BASE}
        searchLabel="Search reports"
        searchPlaceholder="Summary"
        query={state.q}
        archived={state.archived}
        activeHref={feedbackHref(BASE, { ...state, archived: false })}
        archivedHref={feedbackHref(BASE, { ...state, archived: true })}
        archivedNotice="Nothing here is deleted. Archiving a report takes it out of the queue; the reporter no longer sees it either."
      />

      {/* Status filter. A second nav rather than a select, so it works with no
          JavaScript and every option is a shareable URL — the same reasoning as
          the Active/Archived pair above it. */}
      <nav aria-label="Report status" className="mt-3 flex flex-wrap gap-1">
        <StatusLink href={feedbackHref(BASE, { ...state, status: "" })} current={!state.status}>
          All
        </StatusLink>
        {FEEDBACK_STATUSES.map((s) => (
          <StatusLink
            key={s}
            href={feedbackHref(BASE, { ...state, status: s })}
            current={state.status === s}
          >
            {STATUS_LABELS[s]}
          </StatusLink>
        ))}
      </nav>

      <div className="mt-4">
        <Suspense
          key={`${state.q}|${state.sort}|${state.dir}|${state.archived}|${state.status}|${page}`}
          fallback={<DataTableSkeleton rows={8} columns={5} />}
        >
          <ReportsTable state={state} page={page} />
        </Suspense>
      </div>
    </>
  );
}

function StatusLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
        current
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

async function ReportsTable({ state, page }: { state: FeedbackListState; page: number }) {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  // Named columns, and `body` is NOT among them: a queue renders titles, and
  // pulling every reporter's free text to draw a list would be handing it to a
  // screen that has no use for it.
  let query = supabase
    .from("feedback_reports")
    .select("id, kind, severity, status, title, path, reporter_role, created_at, deleted_at", {
      count: "exact",
    });

  // NOT optional, even though RLS also filters. The superadmin holds two
  // permissive SELECT policies and permissive policies OR together, so the
  // practical grant is every row — the active/archived split is an application
  // filter (05-patterns/soft-delete.md).
  query = state.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

  if (state.status) query = query.eq("status", state.status);

  const like = titleLike(state.q);
  if (like) query = query.ilike("title", like);

  const { data, count, error } = await query
    .order(state.sort, { ascending: state.dir === "asc" })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    return (
      <EmptyState
        register="error"
        icon={MessageSquareWarning}
        title="Couldn't load the reports"
        description="Try again in a moment."
      />
    );
  }

  const rows = (data ?? []) as FeedbackRow[];
  const returnTo = feedbackHref(BASE, { ...state, page });

  const columns: Column<FeedbackRow>[] = [
    {
      id: "title",
      header: "Summary",
      card: "title",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{r.title}</span>
          {r.deleted_at && <RecordChip state="archived" />}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      card: "meta",
      cell: (r) => <FeedbackStatusChip status={r.status} size="sm" />,
    },
    {
      id: "severity",
      header: "Severity",
      sortable: true,
      card: "meta",
      cell: (r) => <FeedbackSeverityChip severity={r.severity} size="sm" />,
    },
    {
      id: "kind",
      header: "Kind",
      sortable: true,
      card: "detail",
      cell: (r) => KIND_LABELS[r.kind],
    },
    {
      id: "path",
      header: "Screen",
      card: "detail",
      // A masked route pattern, never a real path — rule 1. Rendered in a mono
      // face so it reads as a route rather than as prose.
      cell: (r) => <span className="font-mono text-xs">{r.path ?? "—"}</span>,
    },
    {
      id: "created_at",
      header: "Filed",
      sortable: true,
      align: "end",
      card: "meta",
      cell: (r) => (
        <time dateTime={r.created_at}>
          {new Date(r.created_at).toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </time>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      href={(r) => `${BASE}/${r.id}`}
      caption="Feedback reports"
      baseHref={BASE}
      params={feedbackParams(state)}
      sort={{ by: state.sort, dir: state.dir }}
      page={{ index: page - 1, size: PAGE_SIZE, total: count ?? 0 }}
      filter={
        state.q
          ? {
              active: true,
              label: `No reports match “${state.q}”.`,
              clearHref: feedbackHref(BASE, { ...state, q: "" }),
            }
          : undefined
      }
      empty={
        <EmptyState
          register={state.archived || state.status ? "cleared" : "first-use"}
          icon={MessageSquareWarning}
          title={
            state.archived
              ? "Nothing archived"
              : state.status
                ? `No ${STATUS_LABELS[state.status].toLowerCase()} reports`
                : "No reports yet"
          }
          description={
            state.archived
              ? "Archived reports will appear here."
              : state.status
                ? "Try another status, or clear the filter."
                : "When anyone reports a problem or suggests something, it arrives here."
          }
        />
      }
      rowActions={(r) => (
        <SoftDeleteMenu
          label={r.title}
          archived={Boolean(r.deleted_at)}
          archiveAction={archiveReport.bind(null, r.id, returnTo)}
          restoreAction={restoreReport.bind(null, r.id, returnTo)}
        />
      )}
    />
  );
}
