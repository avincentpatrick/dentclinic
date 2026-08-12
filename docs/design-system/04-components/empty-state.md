# EmptyState

> Built in Phase 1.2. [src/components/shared/EmptyState.tsx](../../../src/components/shared/EmptyState.tsx) · [gallery](/design-system#empty-state)

Empty is not one state. It is three, and confusing them is how an app starts blaming the
user for its own failures.

## Anatomy

```
<div>                  centred column, register-specific background
  ├── <Icon />         aria-hidden, register-specific default
  ├── title            <p class="font-medium"> — NOT a heading
  ├── description      optional, muted, max-w-sm
  └── actions          primary + optional secondary
```

## Variants (the three registers)

| Register | Meaning | Icon | Tone | CTA |
|---|---|---|---|---|
| `first-use` | Nothing yet — here's how to start | Sparkles | `bg-muted/50`, primary icon | **Required**, directive verb ("Book a visit") |
| `cleared` | You finished everything | CircleCheck | transparent, success icon | Optional, ghost |
| `error` | Something failed, not your fault | CircleAlert | `bg-muted`, **warning** icon | Retry, outline |

## Props

| Prop | Type | Notes |
|---|---|---|
| `register` | `"first-use" \| "cleared" \| "error"` | required — forces the author to choose |
| `title` | `string` | required |
| `description` | `string` | optional |
| `icon` | `LucideIcon` | overrides the register default |
| `action` / `secondaryAction` | `{ label, href }` or `{ label, onClick }` | |

## States

Static presentation. The `error` register is the only one with behaviour: its action should
retry the failed fetch, not navigate away.

## A11y

- `cleared` renders `role="status"` — it follows a user action (clearing the last item), so
  it should be announced.
- `error` renders `role="alert"`.
- `first-use` renders no role: it is the initial content of the page, not an event.
- The title is a `<p>`, **not a heading**. An empty state sits inside someone else's section
  and injecting an `<h2>` breaks the document outline (axe `heading-order`).
- Actions are `min-h-11`.

## Do / Don't

**Do** write directive first-use copy: "Book your first visit", not "No appointments".
**Do** use `cleared` when a list empties through success — an empty reminder queue at 6pm
is an achievement, not an absence.

**Don't** use `--destructive` for the error register. 00-principles says "calm + retry", and
a red-filled panel in a medical app reads as *the patient* being in trouble rather than the
network. This is binding.
**Don't** show a stack trace or an HTTP status. "Couldn't load appointments" and a retry.
**Don't** use `first-use` for a failed fetch — that tells the user they have no data when
the truth is you could not fetch it.

## Example

```tsx
<EmptyState
  register="first-use"
  icon={CalendarClock}
  title="No appointments yet"
  description="Book your first visit — it takes about a minute."
  action={{ label: "Book a visit", href: "/book" }}
/>
```
