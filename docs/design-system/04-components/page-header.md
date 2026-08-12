# PageHeader

> Built in Phase 1.2. [src/components/shell/PageHeader.tsx](../../../src/components/shell/PageHeader.tsx) · [gallery](/design-system#page-header)

The single `<h1>` for a page, plus optional description and actions.

## Anatomy
```
<div>                flex, stacks on mobile
  ├── <h1>           the page title — exactly one per route
  ├── description    optional, muted
  └── actions        optional, right-aligned on sm+
```

## Variants
None. Presence of `description`/`actions` is the only variation — a "compact" variant would
just be inconsistent vertical rhythm.

## Props
| Prop | Type | Notes |
|---|---|---|
| `title` | `string` | required |
| `description` | `string` | optional |
| `actions` | `ReactNode` | primary page actions |
| `className` | `string` | |

## States
Static.

## A11y
- Renders the page's only `<h1>`. **The app shell deliberately has no heading**, so the
  outline always starts here and section headings can safely be `<h2>`.
- Actions come after the title in DOM order, so tab order matches reading order even though
  they render to the right on desktop.

## Do / Don't
**Do** render exactly one per route, at the top of the page content.
**Don't** add a second `<h1>` anywhere, and don't skip it — axe `page-has-heading-one` and
`heading-order` both depend on this being the first heading.
**Don't** put destructive actions here without a confirm step (00-principles: destructive
actions get deliberate friction).

## Example
```tsx
<PageHeader
  title="Patients"
  description="The clinic patient roster."
  actions={<Button className="min-h-11">Add patient</Button>}
/>
```
