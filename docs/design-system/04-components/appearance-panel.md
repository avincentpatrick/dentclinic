# AppearancePanel

> Built in Phase 1.1. [src/components/theme/AppearancePanel.tsx](../../../src/components/theme/AppearancePanel.tsx)
> · gallery entry lands with `/design-system` in Phase 1.2.

Lets anyone — signed in or not — choose theme and text size. The only Phase 1 surface
that writes `user_preferences`.

## Anatomy

```
<form action={savePreferences}>          server action: cookie + DB
  ├── fieldset "Theme"                   3 radios: Light · Dark · System (icon + label)
  ├── fieldset "Text size"               5 radios: Automatic · Standard · Comfortable · Large · Extra large
  │     └── hint: what Automatic currently resolves to
  ├── signed-out note                    page variant only
  └── <noscript> submit button
```

Related: `AppearanceProvider` (state + DOM application, wraps the whole app in the root
layout) and `AppearanceMenu` (popover wrapper for headers).

## Variants

| Variant | Where | Differences |
|---|---|---|
| `page` (default) | `/settings/appearance` | Larger legends, shows the signed-out sync note |
| `compact` | inside `AppearanceMenu` popover | Tighter spacing, smaller legends, no note |

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"page" \| "compact"` | `"page"` | |
| `signedIn` | `boolean` | `false` | `page` only — the caller knows whether there's a session |
| `className` | `string` | — | |

Everything else comes from `useAppearance()`. The component takes no value/onChange props
by design: there is exactly one appearance state per document, and threading it through
props would let two mounts disagree.

## States

- **Idle** — current selection reflected by border + background + weight (never colour alone).
- **Changing** — DOM updates **synchronously** on change, so there is no pending state to
  show. The server action runs in a transition behind it.
- **Signed out** — identical UI; cookie-only persistence. Explained inline in `page`,
  never a prompt to sign in.
- **No JavaScript** — radios submit the form natively; the `<noscript>` button appears.
- **Offline / action fails** — the DOM stays correct for the session and reverts on next
  load. A toast lands with the Phase 2 feedback primitives.

## A11y

- Native `<fieldset>` + `<legend>` + `<input type="radio">` — deliberately **not** a Radix
  `RadioGroup`. Native radios give arrow-key roving focus, group labelling, and correct
  form submission with JS disabled, for free.
- Every option is a `<label>` wrapping its input, so the whole tile is a hit target;
  each is `min-h-11` (≥44px), scaling with the font step.
- Theme tiles use `sr-only` inputs with `focus-within:` outlines on the tile, so keyboard
  focus is always visible.
- Icons are `aria-hidden` — the text label already carries the meaning.
- Selection is conveyed by border + background + font weight, not colour alone.

## Do / Don't

**Do**
- Mount `AppearanceMenu` on any surface a user might land on, including logged-out ones —
  a guest partway through booking must be able to enlarge text.
- Let the DOM update first and persist second. Appearance is a low-risk toggle; this is
  the one place optimistic UI is correct.

**Don't**
- Add a "preview" pane. The document itself is the preview.
- Call `router.refresh()` after saving — the DOM is already right and the cookie is
  written before the action returns, so the re-render is a no-op that can only flicker.
- Read the cookies from client JS. They are `HttpOnly`; current values arrive as props.
- Add a theme toggle anywhere else. One control, one state.

## Example

```tsx
// Canonical screen
<AppearancePanel variant="page" signedIn={Boolean(claims?.sub)} />

// In a header
<AppearanceMenu />
```
