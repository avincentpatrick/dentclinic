# CommandK

> Built in Phase 1.2 (**Navigate only**). [CommandKProvider](../../../src/components/search/CommandKProvider.tsx) · [CommandPalette](../../../src/components/search/CommandPalette.tsx) · [gallery](/design-system#command-k)

Keyboard-first navigation. Phase 1 ships the shell and one provider; Phase 8.2 fills in the
rest without touching the rendering code.

## Anatomy
```
CommandKProvider       context + ⌘K // Ctrl+K // "/" bindings; lazy-loads the palette
  └── CommandPalette   dialog, input, grouped results
       └── section     rendered in SECTION_ORDER, empty groups skipped
```

## Variants
Mobile gets the same dialog full-screen (`top-0 rounded-none sm:top-[10%] sm:rounded-xl`).
There is deliberately **no separate SearchSheet** — that component belongs with Phase 8's
recents and contextual patient mode.

## Props
`CommandKProvider`: `role`, `children`. `CommandPalette`: `role`, `open`, `onOpenChange`.
Consumers use `useCommandK().open()`.

## States
Closed (unmounted until first open) · open/empty · open with results · no results
(`CommandEmpty`).

## A11y
- Radix Dialog underneath: focus trapped, Escape closes, focus returns to the trigger.
- `title`/`description` are passed to the dialog (visually hidden) so it has an accessible name.
- Items are `min-h-11`.
- `/` only opens the palette outside a text field — `isTypingTarget()` guards input,
  textarea, select, and contenteditable.

## Do / Don't
**Do** add new result types as a `SearchProvider` appended to `providers` — the palette
renders `SECTION_ORDER` and skips empty groups, so that is genuinely the only change.
**Do** keep the 200ms debounce; it ships wired in Phase 1 even though the navigate provider
is synchronous, so Phase 8's networked providers inherit it.

**Don't** add a data-bearing provider that filters on the client. **The authoritative role
scope is the server search API (8.2).** Staff must not *receive* clinical-note rows at all,
not merely have them hidden — Phase 8's acceptance criterion is explicit about this.
**Don't** eagerly import cmdk; it is `next/dynamic` with `ssr: false` to stay out of the
initial chunk and the Worker render path.

## Phase 8 seam
`SECTION_ORDER` = Recent → Actions → Patients → Appointments → **Navigate** → Records → Help.
Only Navigate is populated today.

## Example
```tsx
const { open } = useCommandK();
<button onClick={open}>Search</button>
```
