# Module: Feedback & Bug Reports

> Status: PLANNED for Phase 2.2d — this doc is written before the increment, per AGENTS.md.
> Update it in the same commit as the code.

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
2. **No blanket write-audit trigger — a narrow status-transition trigger instead.** `body` is
   free text a user types, and users paste patient names into free text no matter what the
   placeholder says. `private.audit_log` is append-only, 6+ year retention, and **exempt from
   purge**, so mirroring the body there makes accidental PHI permanently unpurgeable. The
   trigger records `{status: old → new}` and the row id, never the body. This is a documented
   exemption in [00-overview.md](00-overview.md).
3. The body field's help text says: *"Describe what happened. Don't include patient names or
   details — reference the appointment time instead."* Rule 2 exists because that will
   sometimes be ignored.
4. **Filing never sends email, and must never be able to.** The superadmin sidebar carries a
   `status='new'` count badge; a pull notification cannot fail. When the Phase 5 send pipeline
   exists, a `blocker` may enqueue an alert — but **as a separate statement outside the
   insert's transaction, with errors swallowed**. Filing a bug report must never fail because
   email is broken, which is precisely when people file bug reports.
5. **Authenticated roles only.** A public insert endpoint on a free tier with no captcha and
   no rate limiting is an abuse vector. Guests on `/book` get the clinic phone number instead.
6. **The superadmin is the only updater.** A filed report is a fact; letting reporters edit
   after triage creates confusion, and there is no comment table in Phase 2. Reporters read
   their own and see status changes.
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

## Open Questions
- Screenshot attachments — revisit in Phase 6 when Storage, signed URLs and retention exist.
- Should `blocker` reports surface on `/dashboard` as an exception-queue card before Phase 8
  generalises that pattern? Cheap, and the alternative is a badge nobody looks at.
- No comment thread in v1. If triage needs back-and-forth with the reporter, that is a
  `feedback_comments` table, not a mutable `body`.
