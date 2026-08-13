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

**Decide before real patient data exists.** Options, roughly in order of preference:
1. Make the repo private again and fix the Actions billing — restores the original model.
2. Keep it public and push backups to a private destination (a private repo's artifacts, R2,
   or a storage bucket) instead of leaving them as artifacts of a public run.
3. Keep as-is with a verified high-entropy passphrase, and accept that the ciphertext is
   public.

Today the database holds **0 patient rows**, so nothing sensitive has been exposed. The window
for choosing closes the moment the clinic registers its first real patient.

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
- Custom domain for the clinic (needed before SPF/DKIM/DMARC in Phase 2 — workers.dev can't hold DNS records; a cheap domain ~$10/yr is the one unavoidable cost)
