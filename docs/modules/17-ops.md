# Module: Ops, Deploy & Compliance

> Filled during Phase 0. Owner of runbooks: deploys, backups/restore, DNS/email deliverability, DPA paperwork.

## Purpose
Keep the clinic's app deployable, its data recoverable, and its paperwork compliant. No tables owned — this module is runbooks and scheduled jobs.

## Environments & accounts

| Thing | Where | Notes |
|---|---|---|
| App hosting | Cloudflare Workers, account `7d899805e140c112fa6b42d69fe3d62b` | Deployed via `npm run deploy` (OpenNext). Live URL: https://dentclinic.dentclinic-appointment-and-recording-system.workers.dev |
| Database/Auth | Supabase project `csslnpmjprfuzofomtda` (ap-southeast-1), **dedicated account** | Free tier: NO built-in backups, pauses after 7 idle days (live clinic traffic prevents this) |
| Repo/CI | github.com/avincentpatrick/dentclinic (private) | CI: lint/typecheck/build. Backup workflow: nightly 02:00 Manila |
| Secrets | `.env.local` (git-ignored) + GitHub Actions secrets | `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE` set in repo secrets |
| Storage | Supabase bucket `branding` (0011) | Public read, 1 MiB, PNG/JPEG/WebP. First bucket in the project |

## Cloudflare API token scopes

`npm run deploy` and `wrangler` read `CLOUDFLARE_API_TOKEN` from `.env.local`. The token needs a
scope **per resource type**, and a missing one fails at creation time with a bare
`Authentication error [code: 10000]` that names no permission — so it reads like a bad token
rather than a narrow one. Being account super-admin does not help: the *token's* permissions are
what count, not the membership role.

Known-needed so far: Workers Scripts (deploy), Workers KV (the incremental cache).
**D1 Edit is required for the branding tag cache and is STILL MISSING** — see the caching note
below. Add scopes at dash.cloudflare.com/profile/api-tokens.

Re-checked **2026-08-14** at the start of 2.2d: `npx wrangler d1 list` fails with
`Authentication error [code: 10000]` on `/accounts/…/d1/database`. So the tag cache remains
unwired and decision 14 stands — with both overrides at their `"dummy"` default, branding is
read per request: slower, always correct. **Do not wire KV alone**; that is the one combination
worse than doing nothing. Check with that one command before planning any cache work.

**Free-tier quirk discovered 2026-08-12:** Supabase's 2-active-free-projects limit counts per *user* across every org they own/administer — a second scratch project could not be created even on the dedicated account. Restore drills therefore target the local Supabase stack (Docker); a real disaster restore would reuse the (dead) production slot.

## Backups

- **What:** nightly GitHub Action ([.github/workflows/backup.yml](../../.github/workflows/backup.yml)) — `supabase db dump` (roles, schema, data) → tar → AES-256 encrypted with `BACKUP_PASSPHRASE` → 30-day artifact.
- **Connection:** session pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432` (IPv4; the direct db host is IPv6-only and unreachable from GitHub runners).
- **Passphrase:** in `.env.local` and GitHub secrets. **A copy must live outside this machine (password manager) — without it backups are unreadable.**

### ⚠ The repo is public, and that changes the threat model

Since 2026-08-13 this repository is public (done to get free Actions minutes). **Workflow
artifacts on a public repo can be downloaded by anyone**, so every nightly backup is a file an
attacker can fetch and attack offline, at leisure, with no rate limit and no audit trail.

Mitigations in place: AES-256-CBC with **PBKDF2 at 600,000 iterations** (the OWASP floor; the
previous default of 10,000 was chosen when the repo was private and is GPU-cheap), 30-day
artifact retention, and no plaintext ever leaving the runner.

That is adequate **only if `BACKUP_PASSPHRASE` is long and randomly generated.** A
human-memorable passphrase is not safe under this threat model — iterations buy time against a
strong secret, they do not rescue a weak one.

**DECIDED 2026-08-13 (owner): stay public, accept public ciphertext.** The passphrase was
verified as randomly generated — 32 characters, 3 character classes, ~191 bits of entropy —
which puts offline recovery beyond reach at any iteration count. The 600k iterations are
defence in depth, not the load-bearing control; the passphrase is.

What this decision depends on, and therefore what must never change quietly:

- **`BACKUP_PASSPHRASE` must stay high-entropy and randomly generated.** If it is ever rotated
  to something memorable, this decision is void and backups must move off public artifacts the
  same day.
- **The passphrase must never enter a tracked file** (AGENTS.md § conventions). It is the only
  thing standing between a public download and the clinic's records.
- **Losing it means losing every backup.** Keep the offline copy in a password manager.

Alternatives, if the decision is ever revisited: make the repo private again and fix Actions
billing; or keep it public and push the encrypted dump to a private destination (R2, a private
repo) rather than leaving it as an artifact of a public run.

## Backup run log

| Date | Trigger | Result |
|---|---|---|
| 2026-08-12 18:44Z | `schedule` | **FAIL** — Actions minutes exhausted while the repo was private |
| 2026-08-13 03:50Z | `workflow_dispatch` | **PASS** — run 31665117218, artifact 17,376 B |
| 2026-08-13 11:21Z | `workflow_dispatch` | **PASS** — run 31695156146, re-confirmed at the start of 2.2a |

**The `schedule` trigger has still never produced a green run.** Both successes were manual
dispatches; the only scheduled attempt predates the repo going public. The next natural fire is
02:00 Manila. Check it before trusting the cron path — a backup that only works when someone
presses a button is not a backup.

Note on credentials, because the two are easy to conflate: **`SUPABASE_DB_URL` has not been
rotated** (the repo secret was last updated 2026-08-12, before the repo went public). What was
rotated on 2026-08-13 was the superadmin *test user's* auth password, published in
`01-auth-roles.md`, which is not in the backup path at all.

## Restore drill log

| Date | What was done | Result |
|---|---|---|
| 2026-08-12 | Dumped schema (102,763 B) + data (20,912 B) from production; wiped local Supabase stack (Docker) and restored both files via psql | **PASS** — auth.users 5/5, identities 5/5, profiles 5/5 (roles intact), audit_log 9/9, access-token hook function present. Schema: 0 errors. Data: 2 non-critical errors (auxiliary auth/storage tables version drift between cloud and local images — acceptable). Confirmed the data dump includes `auth` + `storage` schemas, so user identities survive a disaster. |

### Restore procedure (disaster runbook)
1. Get the latest `backup-*.tar.gz.enc` artifact from GitHub Actions.
2. Decrypt: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in backup-X.tar.gz.enc -out dump.tar.gz -pass env:BACKUP_PASSPHRASE` then untar.
   **The `-iter` must match what encrypted it**, or decryption fails with "bad magic number".
   Artifacts produced before 2026-08-13 used the default 10,000 — omit `-iter` for those.
3. Target: fresh Supabase project (in disaster, the dead production project's slot is free; delete it after export).
4. Apply in order via psql against the session pooler URL: `roles.sql` (errors about reserved `supabase_*` roles are expected — ignore), `schema.sql`, `data.sql`.
5. Verify: profile count, latest audit_log rows, a booking round-trip.
6. Re-point the app: update `NEXT_PUBLIC_SUPABASE_URL`/keys in `.env.local`, GitHub variables, redeploy; re-register auth hook + site_url (see below).

### New-project re-setup checklist (also = what disaster restore must redo)
- Register Custom Access Token Hook: `PATCH /v1/projects/{ref}/config/auth` → `hook_custom_access_token_uri: pg-functions://postgres/private/custom_access_token_hook`
- Set `site_url` + `uri_allow_list` to the deployed URL
- Seed superadmin via `private.settings` key `setup_superadmin_email`
- SMTP (Brevo) in Auth settings — Phase 2

## Caching: KV + D1, and why it must be both or neither

Phase 2.2a moved branding off a module-level TTL memo and onto Next's Data Cache
(`unstable_cache` + `updateTag`). For that to persist on Workers, OpenNext needs two overrides:

| Role | Override | Binding | Status |
|---|---|---|---|
| Incremental cache | `overrides/incremental-cache/kv-incremental-cache` | `NEXT_INC_CACHE_KV` | namespace created `48bf02a7…` |
| Tag cache | `overrides/tag-cache/d1-next-tag-cache` | `NEXT_TAG_CACHE_D1` | **blocked — token lacks D1 Edit** |

**The KV tag cache is not an option.** Its own source says it is experimental and that "KV is
eventually consistent and can take up to 60s to reflect the last write", so a revalidation can
take a minute to apply. That is *worse* than the five-minute memo it would replace is at its
best, and worse than the 30s alternative that was considered and rejected. D1 is strongly
consistent, which is what makes a save visible on the next request.

**Never wire KV without D1.** `defineCloudflareConfig` defaults both overrides to `"dummy"`. With
both dummy — the state 2.2a shipped in — `unstable_cache` simply never persists, so branding is
read from Supabase on every request: slower, but always correct, and the acceptance criterion
still holds. Wiring KV alone would persist entries with **nothing able to invalidate them**,
turning a 5-minute staleness window into a 1-hour one. That is the one combination that is worse
than doing nothing.

When the D1 scope is added:

```bash
npx wrangler d1 create dentclinic-tags --location apac   # match Supabase's ap-southeast-1
npx wrangler d1 execute dentclinic-tags --remote --command \
  "CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, stale INTEGER, expire INTEGER); \
   CREATE INDEX IF NOT EXISTS idx_revalidations_tag ON revalidations (tag);"
```

**The table must NOT have a primary or unique key on `tag`.** `writeTags()` issues a bare
`INSERT` with no `ON CONFLICT`, so a PK there makes the *second* revalidation of any tag throw.
It is append-only and reads take the `MAX`, which means it grows one row per revalidation —
negligible for branding saves, but worth a prune if it is ever used for a high-churn tag.

Then add both bindings to `wrangler.jsonc`, set `incrementalCache`/`tagCache` in
`open-next.config.ts`, and run `npm run cf-typegen`. Both overrides degrade safely if a binding
goes missing (KV throws `IgnorableError` = cache miss; D1 reports `isDisabled` and
short-circuits), so a forgotten binding is a performance regression, not an outage.

The a11y suite needs no bindings at all: `scripts/serve-standalone.mjs` runs the plain Next
standalone build, never `.open-next/worker.js`, so the overrides are never loaded.

## Deploy runbook
- `npm run deploy` (needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in env). Worker gzip size 2026-08-12: **~957 KB** (limit 3 MB — check on every phase-end deploy; FullCalendar/Recharts must stay dynamic imports).
- Supabase migrations: `npx supabase db push` (uses `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`).

## Dependencies & the lock file

**After adding, removing or upgrading any dependency, run `npm run lock:refresh` before
pushing.** It regenerates `package-lock.json` inside `node:24-bookworm` — the same image
family CI uses — and then asserts the result is not platform-pruned.

Why this is not optional: npm resolves platform-specific optional dependencies for the
platform it runs on and prunes the rest. A lock generated on Windows carries one
`@next/swc-*`, one `@tailwindcss/oxide-*` and two `@img/sharp-*` binaries; `npm ci` on an
ubuntu runner demands eight, eleven and twenty-four. CI then fails at **install time, before
a single gate runs**, which is what happened the first time Actions were able to execute in
Phase 2. Plain `npm install` on Windows or macOS will silently re-prune the lock, so treat
that as a local-only side effect.

Two related traps, both hit once:

- **Node majors must match.** Dev on Node 24 (npm 11) with CI pinned to Node 22 (npm 10)
  produced a lock one side wrote and the other rejected. Both workflows now pin **24**;
  change them together or not at all. `npm run verify` claims to be CI offline and that claim
  is void if the npm majors differ.
- **Never bind-mount the repo into a container and run a real `npm ci`/`npm install`.** It
  writes Linux binaries into the host's `node_modules` and leaves the working copy unrunnable
  until a local `npm ci`. `scripts/refresh-lock.mjs` uses `--package-lock-only` precisely to
  avoid this; do not drop that flag.

## Verifying a migration before the UI exists

`supabase/verify/NNNN-*.sql`, run with psql:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/verify/0015-feedback.sql
```

**Committed since 2.2d, and that is the change.** 2.0's 21/21, 2.2a's 39/39 and 2.2b's 47/47
were ad-hoc SQL typed into a session: only their *counts* survive, in PROGRESS.md, so nothing
re-runs them and "the RLS on `patients` is still correct" rests on a number in a markdown file.
Writing the verification before the UI has caught a real bug in every increment that used it;
making it repeatable costs almost nothing.

Three things a verification script here must do, all learned the hard way:

- **`SET ROLE authenticated` and forge `request.jwt.claims`.** The connecting role is a
  superuser and BYPASSES RLS entirely, so a check that runs as `postgres` proves nothing about
  a policy.
- **Assert writes as an actor who is allowed to write.** An UPDATE that no policy grants
  matches zero rows and *succeeds*, so an "is this rejected?" check placed under the wrong role
  passes while testing nothing.
- **Wrap in `begin … rollback`, and create the helper functions BEFORE the `begin`** — the
  rollback drops anything created inside it, including the helpers the post-rollback checks
  need. Note that psql does **not** interpolate `:'variables'` inside a dollar-quoted block;
  use `set_config('verify.x', …, true)` and `current_setting()` instead.

`psql` is not a project dependency; on this machine it is at
`C:\Program Files\PostgreSQL\18\bin\psql.exe`.

## Generated database types

`src/lib/supabase/database.types.ts` is generated, committed, and threaded through both
Supabase client helpers and the middleware's inline client.

**Regenerate with `npm run db:types` in the same commit as any migration.** A stale file is
worse than none: it type-checks against a schema that no longer exists, so the compiler
confidently approves a column that was renamed. It earned its place immediately — adding the
generic surfaced a real looseness in `savePreferences`, which was building its upsert payload
with `theme?: string` instead of the enum.

The script shells out via `npx --yes supabase@latest` because the CLI is not a project
dependency (it is a ~40 MB binary used a few times a phase).

## Build and test parallelism scale with memory, not cores

Two settings, one cause, and both were mistaken for flakiness first:

- `experimental.memoryBasedWorkersCount` in `next.config.ts`
- a free-memory-derived `workers` in `playwright.config.ts`

Next defaults its page-data worker pool to `os.cpus().length - 1` and Playwright defaults to
50% of cores; **neither looks at memory**. On this 22-core dev box that is 18 build workers and
11 Chromium instances. With the machine otherwise busy, both die as
`FATAL ERROR: Zone Allocation failed` / `worker process exited unexpectedly` — the same
Windows abort code `3221226505` (0xC0000409) in both cases.

The symptoms mislead in a specific way worth remembering. The build reports the OOM *per
worker at a ~26 MB heap*, which reads like a Next bug rather than the machine refusing to
commit 18 more processes. The test run fails **all 30 tests at once**, which reads like an
accessibility regression. And because both track whatever else is running, they look
intermittent — which is exactly how PROGRESS.md's 2026-08-13 note describes attributing the
build crash to a component after a single passing sample.

Capping to a constant would throttle a machine with room to spare, so both scale: the build
gets `max(min(cpus, freeGB), 4)`, the tests `max(2, min(4, freeGB / 1.5))`. Capping the test
run did not even cost wall clock — 30 tests went from a crashing 48 s at 11 workers to a green
19 s at 2, because the thrashing was the slow part.

**`shadcn` is a build dependency, not just a CLI.** `src/app/globals.css:3` does
`@import "shadcn/tailwind.css"`, so removing it from `devDependencies` does not merely cost
you the `add` command — every page 500s with `Can't resolve 'shadcn/tailwind.css'`. It looks
like a scaffolding tool in `package.json` and is not one.

There is also an `overrides` block in `package.json` pinning the three `@emnapi/*` packages.
Two dependencies pin conflicting versions of them inside the wasm32-wasi fallback branch, and
npm 11 writes a lock for that graph which its own `npm ci` rejects. They are WebAssembly
fallbacks never loaded on x64, so collapsing them costs nothing. Remove when npm fixes it.

## Compliance (PH Data Privacy Act) — Phase 9 checklist
- [ ] Designate DPO; register with NPC if thresholds met
- [ ] Privacy notice + consent capture in registration flow
- [ ] 72-hour breach-notification plan (who calls whom)
- [ ] Processor list: Supabase, Cloudflare, Brevo, GitHub
- [ ] Retention: 10y after last visit (minors: to age 25) — purge job is Phase 9

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| Any ops action | — | — | — | ✔ (plus repo owner) |

## Open Questions

- **Custom domain — DEFERRED 2026-08-13 (owner): the project stays at $0 through development.**
  `workers.dev` cannot hold DNS records, so SPF/DKIM/DMARC cannot be configured and DMARC
  alignment cannot pass. Consequence, accepted rather than worked around: Phase 2.2c's
  `mail-tester ≥9/10` is **knowingly unmet**; everything else in that increment ships and is
  testable, including a real test send.

  A free subdomain was considered and rejected. The options are: services allowing a single TXT
  record (enough for an ACME challenge, not for three), services needing slow manual approval
  that also forbid commercial use, and the abandoned free TLDs that mail providers filter on
  sight. All three would make deliverability *worse* than having no domain.

  Practical note for the interim setup: a `@gmail.com` from-address sent through Brevo fails
  DMARC by design — Brevo is not authorised to send as you — so test mail may land in spam.
  That is the absence of a domain, not a defect in the send path.

  **Trigger to revisit: before any real patient receives an email.** ~$10/yr at Cloudflare
  Registrar (at-cost, and DNS would then sit beside the Worker). It is the only cost in the
  entire stack — Workers, KV, D1, Supabase, GitHub Actions and Brevo are all free tier.
