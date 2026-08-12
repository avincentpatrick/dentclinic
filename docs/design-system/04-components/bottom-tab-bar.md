# BottomTabBar

> Built in Phase 1.2. [src/components/shell/BottomTabBar.tsx](../../../src/components/shell/BottomTabBar.tsx) · [gallery](/design-system#bottom-tab-bar)

Thumb-first mobile navigation. Five items maximum.

## Anatomy
```
<nav aria-label="Bottom navigation">   fixed bottom, md:hidden, safe-area padded
  └── <ul>
       └── <li> x5    link | fab | command | sheet
            ├── active bar   2px, top edge, primary
            ├── <Icon />     aria-hidden
            └── label        always visible, 0.6875rem
```

## Variants
| Role | Tabs |
|---|---|
| patient | Home · Appointments · **[+ Book]** · Records · Profile |
| staff / doctor | Today · Schedule · Patients · Search · More |
| superadmin | Dashboard · Today · Patients · Search · More |

Item kinds: `link` (navigates), `fab` (raised centre CTA), `command` (opens ⌘K),
`sheet` (opens MoreSheet).

## Props
`role: AppRole` only. The nav config carries **icon components — functions — which cannot
cross the server→client boundary**, so this client component imports `TAB_NAV` itself
rather than receiving items as props.

## States
Default · active (`aria-current="page"` + primary colour + weight + top indicator bar) ·
focus-visible.

## A11y
- ≥44px targets: `min-h-14` filling the full cell.
- Labels are always visible — icon-only tabs test badly with older patients, and this is a
  health app.
- `aria-current="page"` on the active tab.
- Hidden at `md+` via `display:none`, so only one nav is ever in the accessibility tree.
- `pb-[env(safe-area-inset-bottom)]`; requires `viewportFit: "cover"` (set in the root layout).
- The FAB stays the 3rd `<li>` so DOM order == visual order == tab order.
- Global `scroll-padding-bottom` keeps focused elements from hiding behind the bar (SC 2.4.11).

## Do / Don't
**Do** keep it to five items; the sixth belongs behind More.
**Do** give unbuilt destinations a real placeholder page rather than a disabled tab — a
disabled tab is a keyboard dead end and makes `aria-current` untestable.

**Don't** signal active state with colour alone: the indicator bar and font weight are
required, exactly as StatusChip requires an icon.

## Example
```tsx
<BottomTabBar role="patient" />
```
