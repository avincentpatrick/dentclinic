# Pattern: Empty states

> Written in Phase 1.2. Component: [EmptyState](../04-components/empty-state.md).

Empty is three different states wearing the same clothes. Choosing the wrong register is how
an app ends up blaming a user for its own failure — or congratulating them on a network error.

| Register | The user's situation | Copy tone | CTA |
|---|---|---|---|
| `first-use` | Has never had data here | Directive, inviting | Required — a verb ("Book a visit") |
| `cleared` | Had data, dealt with it | Affirming | Optional |
| `error` | Has data; we could not fetch it | Calm, blameless | Retry |

## Rules

1. **The error register uses `--warning`, never `--destructive`.** 00-principles says
   "calm + retry". A red-filled panel in a *medical* app reads as the patient being in
   trouble, not the network. Binding.
2. **Never use `first-use` for a failed fetch.** Telling someone they have no appointments
   when you simply could not load them is a lie with clinical consequences.
3. **Never show a stack trace, an HTTP status, or "Something went wrong".** Name the thing
   that failed: "Couldn't load appointments."
4. **`cleared` is a success state.** An empty reminder queue at 6pm is an achievement.
   Write it that way — "All caught up", not "No items".
5. The title is a `<p>`, not a heading — an empty state sits inside someone else's section
   and must not inject a heading level.
6. `cleared` gets `role="status"`, `error` gets `role="alert"`, `first-use` gets neither
   (it is initial content, not an event).

## Copy examples

| Bad | Good | Why |
|---|---|---|
| "No data" | "No appointments yet" | Name the thing |
| "You have no appointments." | "Book your first visit — it takes about a minute." | Directive, not a verdict |
| "Error 500" | "Couldn't load appointments. Check your connection." | Actionable, blameless |
| "Nothing here!" (after clearing) | "All caught up." | Affirming, not absent |
