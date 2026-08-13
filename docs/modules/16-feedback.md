# Module: Feedback & Bug Reports

> Status: **LIVE since Phase 2.2d** (migration 0015). Written before the increment per
> AGENTS.md, then corrected in the same commit as the code — the deltas between the plan and
> what shipped are marked **AS BUILT** below rather than quietly rewritten.

## Purpose
One place for anyone using the system to say "this is broken" or "this should work
differently", and one place for the superadmin to triage what comes in. In a solo-dev clinic
app the alternative is a verbal report at the front desk that reaches nobody.

## Data Owned

### `public.feedback_reports` (Phase 2.2d)
`id`, `reporter_id → profiles(id)`, **`reporter_role`** (a snapshot of `jwt_role()` at insert —
the reporter's role can change later and the report should still read correctly),
`kind` (`feedback_kind`: bug/idea/question/data_issue), `severity` (`feedback_severity`:
blocker/major/minor/cosmetic, reporter-set and superadmin-overridable), `title`, `body`,
auto-captured `path`/`user_agent`/`viewport`/`app_version`, `status` (`feedback_status`:
new/triaged/in_progress/resolved/wont_fix/duplicate), `triage_note`, `duplicate_of_id`,
`resolved_at`/`resolved_by`, plus the standard timestamps and soft-delete pair.

`path`, `user_agent` and `viewport` are captured automatically because in a mobile-first app
more than half of UI bugs are viewport- or browser-specific and nobody reports those fields
accurately.

**AS BUILT — there is no `app_version` column.** Nothing in the app threads a build id
anywhere, so it would have shipped and stayed null forever, and "an unused column somebody
later assumes is maintained" is exactly the smell 2.2b caught itself producing when 0013
seeded a `currency` key nothing could read. Add it when there is a build id to put in it.

**AS BUILT — `path` is nullable**, meaning "could not be attributed to a known screen". A
placeholder like `/unknown` would be a path that looks real and is not. **`user_agent` is read
server-side** from the request headers rather than submitted: there is no reason to let a
client describe its own browser, and it is one fewer field to validate.

## Screens (routes)
- **`FeedbackDialog`** — "Report a problem", reachable from the sidebar Settings group and the
  mobile More sheet, for every signed-in role. Lazy-loaded like CommandK (worker-size
  discipline).
- **`/feedback`** — the same form as a page, so the dialog is progressive enhancement and the
  link is shareable, plus "My reports" with their statuses. In the `(shared)` route group.
- **`/admin/feedback`** and `/admin/feedback/[id]` — the superadmin triage queue.

## Rules & Invariants

1. **`path` is stored with dynamic segments masked** — `/patients/[id]`, never a real id, and
   never a query string. Without this the table quietly becomes a log of which patient each
   staff member was looking at and when, readable by the superadmin *outside* the audit trail
   that exists to control exactly that. This is the single most important rule in the module.

   **AS BUILT, this is not sanitisation.** A sanitiser is a function that can be wrong: miss a
   case, mishandle an encoding, and a uuid survives. Instead
   [`maskPath`](../../src/lib/feedback/path.ts) maps the submitted value onto `ROUTE_PATTERNS`
   — a closed set — and returns a member of it or `null`. The id is not stripped from the
   string; **the string is discarded and replaced by the pattern it matched**, so no code path
   writes caller-supplied text into the column.

   Two things keep that honest:

   - `scripts/check-routes.mjs` asserts `ROUTE_PATTERNS` **set-equals** the `AppRoutes` union
     Next generates. A route that is missing from it, or stale in it, fails `npm run check`.
     Both directions were negative-tested before the gate was trusted.
   - The `feedback_reports_path_masked` CHECK in migration 0015 says the same thing again in
     the database, because `maskPath` protects the *server action* and any signed-in user can
     POST straight to PostgREST. Every segment must be a bracketed placeholder or a lowercase
     slug of at most 25 characters, which makes a query string, a numeric patient number and a
     36-character uuid **unrepresentable** rather than merely stripped.

   Considered and rejected: a foreign key into a seeded table of routes, or an enum. Either is
   stronger still, and either would demand a migration every time a route is added — a cost
   paid forever to close a gap the two layers above already close.
2. **No blanket write-audit trigger — a narrow status-transition trigger instead.** `body` is
   free text a user types, and users paste patient names into free text no matter what the
   placeholder says. `private.audit_log` is append-only, 6+ year retention, and **exempt from
   purge**, so mirroring the body there makes accidental PHI permanently unpurgeable. The
   trigger records `{status: old → new}` and the row id, never the body. This is a documented
   exemption in [00-overview.md](00-overview.md).

   **AS BUILT:** `feedback_reports_status_audit` is `after update of status, deleted_at`, and
   its function additionally guards on `is distinct from` — `update of` fires when a column is
   merely *mentioned* in the statement, so both are needed for a triage-note-only save to
   leave no trace. It writes action **`update`**, not a new `status_change` code:
   `private.audit_log`'s CHECK (0002) allows
   read/create/update/delete/sign/export/login/settings_change, and amending a shipped
   constraint to gain a synonym for what an update already is would be a schema change
   carrying no new information.

   Filing writes **no** audit row at all. The row itself is the record.
3. The body field's help text says: *"Describe what happened. Don't include patient names or
   details — reference the appointment time instead."* Rule 2 exists because that will
   sometimes be ignored.
4. **Filing never sends email, and must never be able to.** The superadmin sidebar carries a
   `status='new'` count badge; a pull notification cannot fail. When the Phase 5 send pipeline
   exists, a `blocker` may enqueue an alert — but **as a separate statement outside the
   insert's transaction, with errors swallowed**. Filing a bug report must never fail because
   email is broken, which is precisely when people file bug reports.

   **AS BUILT:** the badge hangs off a dedicated superadmin nav entry (`/admin/feedback`, in
   the Administration group) rather than off the `/admin` hub, so the count sits beside the
   thing it counts. `AppShell` fetches it with `getNewReportCount()` for superadmins only and
   passes a *number* across the server-to-client boundary. `NavCountBadge` renders nothing at
   zero, caps at 99+, and carries its own screen-reader sentence, because "Feedback 3"
   announces as a fragment rather than a fact.
5. **Authenticated roles only.** A public insert endpoint on a free tier with no captcha and
   no rate limiting is an abuse vector. Guests on `/book` get the clinic phone number instead.
6. **The superadmin is the only updater.** A filed report is a fact; letting reporters edit
   after triage creates confusion, and there is no comment table in Phase 2. Reporters read
   their own and see status changes.

   **AS BUILT** this is enforced twice: no UPDATE policy grants it to anyone but the
   superadmin, *and* `feedback_reports_guard` pins `title`, `body`, `path`, `kind`,
   `user_agent`, `viewport` and both reporter columns immutable on UPDATE — so not even the
   superadmin can rewrite what somebody reported. The guard also derives
   `resolved_at`/`resolved_by` from the status transition rather than accepting them, and
   overwrites `reporter_id`, `reporter_role` and `status` on INSERT, which is what makes
   filing-as-someone-else impossible rather than merely unimplemented.
7. Soft delete as everywhere — triage "Archive", no DELETE grant.
8. **Screenshots are deliberately out of scope.** Storage buckets with role-checked signed
   URLs, retention and read-audit all arrive in Phase 6, and a screenshot of a staff screen is
   PHI. It would also share the free Storage quota with clinical documents. Revisit in Phase 6.

## A naming collision worth not "fixing"
`GalleryEntry["group"]` in [registry.tsx](../../src/components/gallery/registry.tsx) already
has a `"feedback"` value meaning **UI feedback** — Skeleton lives there, and sonner toasts join
it in this very phase, so the name is becoming *more* correct, not less. Do not rename it.
Bug-report components live under `src/components/feedback-report/` and register as
`group: "shared"`. The table stays `feedback_reports` (canonical, PLAN.md) and the route stays
`/feedback` (the user-facing word).

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| File a report | ✔ | ✔ | ✔ | ✔ |
| Read own reports | ✔ | ✔ | ✔ | ✔ |
| Read anyone's reports | — | — | — | ✔ |
| Triage (status, severity, note, duplicate-of) | — | — | — | ✔ |
| Archive | — | — | — | ✔ |
| Hard delete | — | — | — | — |

## Verification

`supabase/verify/0015-feedback.sql` — **54 checks, run against the real project before any UI
existed**, and committed so it can be re-run. It covers the grant and policy shape, both
directions of rule 1 (a uuid, a numeric id, a query string, a fragment, an uppercase segment
and an over-long segment are all rejected; masked patterns, `/` and NULL are accepted), the
guard's overwrites, per-role RLS including anon, immutability after filing, and rule 2 in
detail — that a status change writes exactly one `update` row carrying only the status keys,
and that a triage-note edit writes none. It runs inside a transaction that ends in `ROLLBACK`,
then asserts the database is unchanged.

One check earned its keep during its own writing: the self-referencing-duplicate assertion
first lived in the staff section, where it PASSED while proving nothing — staff hold no UPDATE
policy, so the statement matched zero rows and "succeeded" without ever reaching the
constraint. A write assertion is only an assertion when the actor can write.

**Live acceptance on the deployed URL, 27 checks.** A staff user opened a real patient chart,
followed the sidebar link (whose `?from=` carried the real uuid), and filed a report; the row
landed with `path = '/patients/[id]'`. The superadmin found it in the queue, opened it, moved
its status, and `private.audit_log` gained exactly one row — `{"status":"new"}` to
`{"status":"in_progress"}` — with zero rows carrying body, title, path or triage note.

## Open Questions
- Screenshot attachments — revisit in Phase 6 when Storage, signed URLs and retention exist.
- The `FeedbackDialog`, deferred above. Only worth building if the page form proves to be
  friction in real use.
- Should `blocker` reports surface on `/dashboard` as an exception-queue card before Phase 8
  generalises that pattern? Cheap, and the alternative is a badge nobody looks at.
- No comment thread in v1. If triage needs back-and-forth with the reporter, that is a
  `feedback_comments` table, not a mutable `body`.
