import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A server-rendered table that is a card list on phones.
 *
 * NOT TanStack Table, amending PLAN.md's component inventory. Sorting,
 * filtering and pagination are all server-side — the roster is RLS-scoped PHI
 * and must never ship whole to a browser — which removes TanStack's row models,
 * i.e. its entire value. What would remain is column definitions and header
 * rendering, and that is the ~120 lines below with a better-typed API. It would
 * also cost ~14 KB gzip in BOTH bundles (client components are SSR'd too) and
 * force this to be a Client Component, forfeiting the real win: the roster
 * ships zero client JavaScript.
 *
 * Mobile renders a card list and desktop renders a <table>; both are emitted
 * and `display:none` picks one. Same trade AppShell makes for its two navs:
 * ~8-12 KB of extra markup, no JS breakpoint hook, and only `display:none`
 * removes a subtree from the accessibility tree. Authoring is not duplicated —
 * cards derive from the same `columns` array via each column's `card` role.
 */

export type SortDir = "asc" | "desc";

export type Column<Row> = {
  /** Also the server sort key. */
  id: string;
  header: string;
  cell: (row: Row) => React.ReactNode;
  /** Renders the header as a link and sets aria-sort. */
  sortable?: boolean;
  /**
   * Role in the <md card. `title` is the card's link text — exactly one column
   * must be `title` when `href` is given. `hidden` drops it from cards.
   */
  card?: "title" | "meta" | "detail" | "hidden";
  align?: "start" | "end";
  className?: string;
};

export type DataTableProps<Row> = {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Whole-row navigation. There is deliberately no onRowClick — see below. */
  href?: (row: Row) => string;
  /** Rendered as an sr-only <caption>. A table needs a name. */
  caption: string;

  /** All server state travels in the URL. */
  baseHref: string;
  params: Record<string, string | undefined>;
  sort?: { by: string; dir: SortDir };
  page: { index: number; size: number; total: number };

  /**
   * Shown when there are genuinely no rows. The caller picks the register,
   * because only the caller knows whether this is first-use or an error.
   */
  empty: React.ReactNode;
  /**
   * A FILTERED empty result is not an EmptyState — empty-state.md forbids
   * `first-use` for "we have data, your filter matched none of it", which would
   * tell the user they have no patients when they have four hundred.
   */
  filter?: { active: boolean; label: string; clearHref: string };

  /** Per-row menu. Rendered outside the row link's hit area. */
  rowActions?: (row: Row) => React.ReactNode;
};

function buildHref(
  base: string,
  params: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const merged = { ...params, ...patch };
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") search.set(k, v);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  href,
  caption,
  baseHref,
  params,
  sort,
  page,
  empty,
  filter,
  rowActions,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    // Two different nothings. A filtered miss offers a way out; a truly empty
    // dataset explains how to start.
    if (filter?.active) {
      return (
        <p role="status" className="rounded-lg bg-muted/50 px-6 py-12 text-center text-sm text-muted-foreground">
          No results for {filter.label}.{" "}
          <Link href={filter.clearHref} className="font-medium text-primary underline underline-offset-4">
            Clear the filter
          </Link>
        </p>
      );
    }
    return <>{empty}</>;
  }

  const cardCols = columns.filter((c) => c.card !== "hidden");
  const titleCol = cardCols.find((c) => c.card === "title") ?? cardCols[0];
  const metaCols = cardCols.filter((c) => c !== titleCol);

  const from = page.index * page.size + 1;
  const to = Math.min((page.index + 1) * page.size, page.total);
  const hasPrev = page.index > 0;
  const hasNext = to < page.total;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- phones: a card list ------------------------------------------ */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const to = href?.(row);
          return (
            <li
              key={rowKey(row)}
              className="relative flex items-start justify-between gap-3 rounded-lg border border-border p-4"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  {to ? (
                    // after:absolute after:inset-0 makes the whole card the hit
                    // area while keeping ONE real anchor for the keyboard.
                    <Link href={to} className="after:absolute after:inset-0 focus-visible:outline-none">
                      {titleCol.cell(row)}
                    </Link>
                  ) : (
                    titleCol.cell(row)
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {metaCols.map((c) => (
                    <span key={c.id}>{c.cell(row)}</span>
                  ))}
                </div>
              </div>
              {rowActions && <div className="relative z-10 shrink-0">{rowActions(row)}</div>}
            </li>
          );
        })}
      </ul>

      {/* ---- md+: a real table -------------------------------------------- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full caption-bottom border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => {
                const active = sort?.by === c.id;
                const nextDir: SortDir = active && sort?.dir === "asc" ? "desc" : "asc";
                return (
                  <th
                    key={c.id}
                    scope="col"
                    // aria-sort belongs on the header cell, not the link.
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "px-3 py-2 font-medium text-muted-foreground",
                      c.align === "end" ? "text-end" : "text-start",
                      c.className,
                    )}
                  >
                    {c.sortable ? (
                      // A Link, not a button: it changes the URL, so this gets
                      // back-button, open-in-new-tab and no-JS operation free.
                      <Link
                        href={buildHref(baseHref, params, { sort: c.id, dir: nextDir, page: undefined })}
                        className="inline-flex min-h-11 items-center gap-1 hover:text-foreground"
                      >
                        {c.header}
                        {active ? (
                          sort.dir === "asc" ? (
                            <ArrowUp aria-hidden="true" className="size-3.5" />
                          ) : (
                            <ArrowDown aria-hidden="true" className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-50" />
                        )}
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && <th scope="col" className="w-px px-3 py-2"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const to = href?.(row);
              return (
                <tr key={rowKey(row)} className="relative border-b border-border last:border-0 hover:bg-muted/40">
                  {columns.map((c, i) => (
                    <td
                      key={c.id}
                      className={cn(
                        "px-3 py-3",
                        c.align === "end" ? "text-end" : "text-start",
                        c.className,
                      )}
                    >
                      {i === 0 && to ? (
                        <Link href={to} className="font-medium after:absolute after:inset-0 focus-visible:outline-none">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                  {rowActions && (
                    // z-10 lifts the menu above the row link's ::after overlay.
                    <td className="relative z-10 px-3 py-3 text-end">{rowActions(row)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- pagination ---------------------------------------------------- */}
      {page.total > page.size && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
        >
          <p>
            {from}–{to} of {page.total}
          </p>
          <div className="flex items-center gap-1">
            <PageLink
              href={buildHref(baseHref, params, { page: String(page.index) })}
              enabled={hasPrev}
              label="Previous"
            />
            <PageLink
              href={buildHref(baseHref, params, { page: String(page.index + 2) })}
              enabled={hasNext}
              label="Next"
            />
          </div>
        </nav>
      )}
    </div>
  );
}

/** A disabled control must still be findable, so it renders as a span, not a
 *  removed element — and never as a disabled <a>, which is not a thing. */
function PageLink({ href, enabled, label }: { href: string; enabled: boolean; label: string }) {
  const base = "inline-flex min-h-11 items-center rounded-md px-3";
  if (!enabled) {
    return (
      <span aria-disabled="true" className={cn(base, "opacity-40")}>
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={cn(base, "font-medium text-foreground hover:bg-muted")}>
      {label}
    </Link>
  );
}
