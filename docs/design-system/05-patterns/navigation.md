# Pattern: Navigation

> Written in Phase 1.2.

## Shape

| Viewport | Component | Hidden by |
|---|---|---|
| `< md` | `BottomTabBar` (+ `MoreSheet`) | `md:hidden` |
| `>= md` | `AppSidebar` (256px / 56px rail) | `hidden md:flex` |

Both trees render on every request; `display:none` picks one.

## The responsive switch is CSS-only. Do not "fix" this with a hook.

This decision gets re-litigated by anyone who notices both trees in the DOM, so here is the
reasoning in full:

1. **The server has no viewport.** Any `useMediaQuery`/`useIsMobile` hook must guess during
   SSR and correct after hydration — producing either a hydration mismatch or a visible
   flash. Phase 1.1's entire thesis is SSR-correct first paint with no flash; reintroducing
   a breakpoint guess in 1.2 would contradict the increment that just shipped.
2. **`display:none` removes a subtree from the accessibility tree entirely.** Screen readers
   and axe both skip it. So "renders both" costs ~2–4KB of markup and *nothing* in
   correctness.
3. A UA-sniffing cookie is the only way to make JS SSR-correct, and it is wrong on tablets,
   split-screen, and any desktop window resize.

Consequences that must be honoured:
- Use `hidden` / `md:flex` (`display:none`). **Never** `opacity-0`, `invisible`, or
  `max-h-0` — those leave links focusable and announced, giving screen-reader users a
  duplicate navigation.
- The two `<nav>`s need distinct `aria-label`s ("Sidebar navigation" / "Bottom navigation")
  so `landmark-unique` cannot fire.

This is also why shadcn's `sidebar` block was **refused**: it ships its own `useIsMobile()`
media-query hook and a competing cookie/provider, for a navigation that is six links.

## Config lives in `src/lib/shell/nav.ts` — and cannot be passed as a prop

`NavItem.icon` is a React component, i.e. a **function**, and functions cannot cross the
server→client props boundary. `AppShell` (server) therefore passes only `role: AppRole`;
`BottomTabBar` and `AppSidebar` (clients) import the config themselves. Passing a `NavItem`
as a prop throws "Functions cannot be passed directly to Client Components."

Never import `nav.ts` from middleware — it would drag lucide into the edge bundle. Icon-free
shell constants live in `src/lib/shell/config.ts`.

## Unbuilt destinations get placeholder pages, not disabled tabs

A disabled tab is a keyboard dead end, fails "≥44px *actionable* target", and makes
`aria-current` untestable. A placeholder page is ~12 lines, gives `aria-current` something
real to assert against, forces the route table to be written correctly now, and is the
cheapest possible integration test of `PageHeader` + `EmptyState`.

`NavItem.phase` is annotation only — it never disables anything.

## Active state
`aria-current="page"`, plus **colour + weight + an indicator bar**. Icon tint alone would be
a colour-only signal, which the StatusChip rule forbids in navigation just as much as in
status.

Matching: `exact` for hubs (`/today`), `prefix` for sections with children (`/patients`).

## Cookie-persisted, not DB-persisted
Sidebar collapse lives in `dc_sidebar`, read server-side so the width is correct on first
paint, and written client-side (`document.cookie` + a direct `--sidebar-w` mutation) so the
toggle costs no round-trip.

It is **not** mirrored to `user_preferences`: theme and font size are accessibility
preferences that should follow a person across devices; sidebar width is a per-device
viewport choice.
