# AppSidebar

> Built in Phase 1.2. [src/components/shell/AppSidebar.tsx](../../../src/components/shell/AppSidebar.tsx) · [gallery](/design-system#app-sidebar)

Desktop navigation. Three presentations: **256px expanded**, **56px rail**, and — on mobile,
via `MoreSheet` — a **bottom sheet**.

## Anatomy
```
<aside>                fixed, w-[var(--sidebar-w)], hidden below md
  ├── brand + toggle   clinic name (from clinic_branding) + collapse button
  ├── search button    opens ⌘K
  ├── <nav>            grouped links, aria-current on the active one
  └── footer           <Suspense> UserChip / UserChipSkeleton
```

## Variants
| State | Width | Labels | Cookie |
|---|---|---|---|
| expanded | `16rem` | visible | `dc_sidebar=expanded` |
| collapsed (rail) | `3.5rem` | `sr-only` + tooltip | `dc_sidebar=collapsed` |

## Props
| Prop | Type | Notes |
|---|---|---|
| `role` | `AppRole` | selects the nav group set |
| `defaultCollapsed` | `boolean` | read from the cookie server-side |
| `brandName` | `string` | from `clinic_branding` |
| `children` | `ReactNode` | footer slot — the UserChip Suspense boundary |

## States
Expanded · collapsed · link hover · **active** (`aria-current="page"` + accent background +
medium weight) · focus-visible ring.

## A11y
- `aria-label="Sidebar navigation"`, distinct from the tab bar's "Bottom navigation", so
  `landmark-unique` can never fire even though both trees are in the DOM.
- Hidden below `md` with `display:none` (`hidden md:flex`) — that removes it from the
  accessibility tree entirely. **Never** use `opacity`/`visibility`: those leave links
  focusable and announced, producing duplicate navigation.
- Collapse toggle has `aria-expanded` and a label that describes the *result*.
- In rail mode every link keeps an `sr-only` label plus a Radix tooltip.
- All targets `min-h-11`.

## Do / Don't
**Do** persist collapse in a cookie and read it server-side — the width must be right on
first paint.
**Do** write the cookie and mutate `--sidebar-w` directly on toggle: no round-trip, no
re-render, and the next SSR already agrees.

**Don't** mirror the collapsed state to `user_preferences`. Theme and font size are
accessibility preferences that should follow a person across devices; sidebar width is a
per-device viewport choice, and syncing it means a desktop toggle shrinks their laptop.
**Don't** introduce a JS breakpoint hook to swap sidebar/tab bar — see 05-patterns/navigation.md.

## Example
```tsx
<AppSidebar role={role} defaultCollapsed={collapsed} brandName={clinicName}>
  <Suspense fallback={<UserChipSkeleton />}><UserChip /></Suspense>
</AppSidebar>
```
