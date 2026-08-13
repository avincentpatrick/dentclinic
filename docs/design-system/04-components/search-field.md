# SearchField

> Built in Phase 2.1. [src/components/shared/SearchField.tsx](../../../src/components/shared/SearchField.tsx) · [gallery](/design-system#search-field)

Filters one server-rendered list by putting the query in the URL.

## Not the same thing as ⌘K

[CommandK](command-k.md) is navigate-only, role-scoped, and global; it never returns data
rows (`lib/search/sections.ts` makes that a rule, not a preference). This filters a single
list on a single page. They will never merge.

## Anatomy

```
<form role="search" method="GET" action={page}>
  ├── hidden inputs        every OTHER search param, so filters survive submit
  ├── <label class="sr-only">
  ├── <Input type="search"> with a leading Search icon
  ├── Clear link           only when a query is active
  └── <noscript><button>   the no-JS submit
```

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `action` | `string` | — | the page this filters, e.g. `/patients` |
| `label` | `string` | — | required; rendered `sr-only` |
| `name` | `string` | `"q"` | the search param |
| `defaultValue` | `string` | — | the current query, from `searchParams` |
| `placeholder` | `string` | `"Search…"` | |
| `debounceMs` | `number` | `250` | |

## States

**empty · typing (debouncing) · active (Clear shown).** There is no loading state of its own —
the page's own Suspense boundary and `DataTableSkeleton` own that.

## A11y

- `role="search"` on the form, and a real `<label>` (visually hidden). A placeholder is not a
  label: it disappears exactly when it is needed.
- `type="search"` gets the platform's clear affordance and the right mobile keyboard.
- `min-h-11` and `text-base` — below `1rem` iOS zooms the viewport on focus.
- The **Clear** control is a link to the unfiltered URL, so it is reachable and meaningful
  without JavaScript.

## Do / Don't

**Do** `router.replace`, never `push`. Typing six characters must not put six entries in the
back stack.

**Do** delete `page` on every query change. Searching from page 4 otherwise shows "no results"
for a query that has three.

**Do** re-emit the other search params as hidden inputs. Without them, filtering by "archived"
and then typing silently clears the filter — the classic bug in GET-form search.

**Don't** fetch results client-side. The list is server-rendered and RLS-scoped; a client fetch
would need an endpoint that returns PHI as JSON, which is precisely what
`lib/search/sections.ts` forbids.

**Don't** debounce below ~200 ms. Every keystroke is a server render.

## Example

```tsx
<SearchField
  action="/patients"
  label="Search patients by name, number or email"
  placeholder="Search patients…"
  defaultValue={q}
/>
```
