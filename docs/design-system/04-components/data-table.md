# DataTable

> Built in Phase 2.1. [src/components/shared/DataTable.tsx](../../../src/components/shared/DataTable.tsx) · [gallery](/design-system#data-table)

A server-rendered table that is a card list on phones. All state lives in the URL.

## Why not TanStack

PLAN.md's component inventory says "DataTable (TanStack)". This amends it.

Sorting, filtering and pagination are **server-side** — the roster is RLS-scoped PHI and must
never ship whole to a browser — which removes TanStack's row models, i.e. its entire value.
What would be left is column definitions and header rendering: ~120 lines here, with a
better-typed API than `ColumnDef<T, unknown>`. It would also cost ~14 KB gzip in **both**
bundles (client components are server-rendered too) and force this to be a Client Component,
forfeiting the real win — **the roster ships zero client JavaScript**. PLAN's own risk ladder
already lists TanStack as a dynamic-import candidate; a component that must be lazy-loaded
cannot be a Server Component.

## Anatomy

```
<div>
  ├── <ul class="md:hidden">          card list — phones
  │     └── <li> title + meta + rowActions
  ├── <div class="hidden md:block">   table — md and up
  │     └── <table>
  │           ├── <caption class="sr-only">
  │           ├── <thead>  sortable headers are <Link>s, aria-sort on the <th>
  │           └── <tbody>  first cell carries the row link
  └── <nav aria-label="Pagination">   "26–50 of 412" + Prev/Next links
```

Both breakpoint renders are emitted and `display:none` picks one — the same trade
[AppSidebar](app-sidebar.md)/[BottomTabBar](bottom-tab-bar.md) make. Cost is ~8–12 KB of
markup for 25 rows; the gain is no JS breakpoint hook and no server/client guess. Authoring is
**not** duplicated: cards derive from the same `columns` array via each column's `card` role.

## Props

| Prop | Type | Notes |
|---|---|---|
| `columns` | `Column<Row>[]` | `{ id, header, cell, sortable?, card?, align?, className? }`. `id` doubles as the server sort key. |
| `rows` / `rowKey` | `Row[]` / `(row) => string` | |
| `href` | `(row) => string` | whole-row navigation. There is **no `onRowClick`** — see A11y. |
| `caption` | `string` | **required**; rendered `sr-only`. A table needs a name. |
| `baseHref` / `params` | `string` / `Record<string,string\|undefined>` | every generated link preserves the other params |
| `sort` | `{ by, dir }` | |
| `page` | `{ index, size, total }` | zero-based `index` |
| `empty` | `ReactNode` | shown only when the dataset is genuinely empty; the caller picks the register |
| `filter` | `{ active, label, clearHref }` | a **filtered** miss renders its own message instead |
| `rowActions` | `(row) => ReactNode` | e.g. `SoftDeleteMenu`; kept out of the row link's hit area |

`card`: `"title"` is the card's link text (exactly one column, when `href` is given),
`"meta"`/`"detail"` render in the sub-line, `"hidden"` drops it from cards.

## States

**populated · empty · filtered-empty · loading.** Loading is
[`DataTableSkeleton`](../../../src/components/shared/DataTable.skeleton.tsx), which mirrors
both breakpoint shapes — a single-shape skeleton jumps on one of them.

**Empty and filtered-empty are different states on purpose.** `empty-state.md` forbids
`first-use` for "we have data, your filter matched none of it" — that tells a clinic with four
hundred patients that they have none. A filtered miss renders `role="status"` plus a
**Clear the filter** link.

## A11y

- **Sort and page controls are `<Link>`s, not buttons.** They change the URL, so they get the
  back button, open-in-new-tab, prefetch and no-JS operation for free.
- `aria-sort` goes on the `<th>`, not on the link inside it.
- **No clickable `<tr>`.** Row navigation is a real anchor in the first cell, expanded to the
  row with `after:absolute after:inset-0`. A click handler on a row is not keyboard-reachable
  and is an axe failure. `rowActions` sits at `z-10` so it stays clickable above that overlay.
- A disabled pagination control renders as `<span aria-disabled="true">`, never a removed
  element (it would shift layout) and never a disabled `<a>` (not a thing).
- All interactive targets are `min-h-11`.

## Do / Don't

**Do** put every piece of list state in `searchParams` — `q`, `sort`, `dir`, `page`,
`archived`. That is what keeps this a Server Component.

**Do** reset `page` whenever a filter or sort changes. Searching from page 4 otherwise shows
"no results" for a query that has three.

**Don't** add `onRowClick`, row selection state, or client-side sorting. Each one turns this
into a Client Component and puts PHI in the browser's memory for no benefit.

**Don't** render more than ~50 rows per page. There is no virtualisation and there should not
be — pagination is the answer.

## Three things the live roster had to get right

1. **`sort` and `dir` must be in `params`.** The pagination links patch only `page`, so
   anything missing from `params` is silently dropped on Next/Previous — you sort by date of
   birth, turn the page, and land back on name order.
2. **The query needs a stable tiebreaker** (`.order("id")` after the sort column). Two rows
   that sort equal — two Maria Santoses, or any two null dobs — can otherwise appear on both
   pages or on neither, because the database is free to order them differently per query.
3. **The list query must filter soft-deleted rows itself.** Staff hold two permissive SELECT
   policies on `patients` and permissive policies OR together, so the practical grant is every
   row. See [soft-delete.md](../05-patterns/soft-delete.md).

**No `loading.tsx` for a route whose page body writes an audit row.** Without Cache Components
a dynamic route is not prefetched at all unless it has a loading boundary; adding one makes
every row link prefetchable. `/patients` streams via `<Suspense>` inside the page instead. If
a future phase adds one, `DataTable` needs a `prefetch?: boolean` prop *and* the read audit
has to be re-verified.

## Example

```tsx
<DataTable
  caption="Patient roster"
  columns={[
    { id: "full_name", header: "Name", cell: (p) => p.full_name, sortable: true, card: "title" },
    { id: "patient_number", header: "No.", cell: (p) => p.patient_number, card: "meta" },
    { id: "dob", header: "Date of birth", cell: (p) => formatDate(p.dob), sortable: true, card: "meta" },
  ]}
  rows={patients}
  rowKey={(p) => p.id}
  href={(p) => `/patients/${p.id}`}
  baseHref="/patients"
  params={{ q, sort, dir }}
  sort={{ by: sort, dir }}
  page={{ index, size: 25, total }}
  empty={<EmptyState register="first-use" title="No patients yet" … />}
  filter={{ active: Boolean(q), label: `“${q}”`, clearHref: "/patients" }}
  rowActions={(p) => <SoftDeleteMenu … />}
/>
```
