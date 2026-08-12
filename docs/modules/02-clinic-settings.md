# Module: Clinic Settings & Lookups

> Status: PARTIAL since Phase 1.1 — owns `user_preferences` and the `clinic_branding` view.
> Lookups, the branding admin UI, and email settings land in Phase 2.2.

## Purpose
Holds everything a clinic configures about itself (branding, timezone, booking windows,
email provider, lookup lists) plus each user's personal display preferences. Phase 1.1
shipped only the two pieces the design system needs: the brand hue and per-user appearance.

## Data Owned

### `public.user_preferences` (Phase 1.1)
`user_id (= profiles.id)`, `theme` (`theme_pref`: light/dark/system),
`font_size` (`font_size_pref`: auto/standard/comfortable/large/xlarge),
`reduce_motion`, `gamification jsonb` (Phase 10 toggles), `created_at/updated_at`.

RLS own-row select/insert/update. **No DELETE policy and no DELETE grant** — "reset to
defaults" is an UPDATE. No row is auto-created at signup; writes are upserts, so
"no row" simply means "no DB preference yet".

**Two deliberate exceptions to the schema conventions in [00-overview.md](00-overview.md):**

1. **No `deleted_at`/`deleted_by`.** Soft delete exists to preserve facts referenced by
   audit/clinical/financial history, keep FKs valid, and power an Archive/Undo UI. This
   table satisfies none: no dependents, lifetime exactly equals its profile's, no archive
   affordance, and "reset" is semantically an UPDATE. Adding it would force every read to
   filter and would create an incoherent state ("this user's preferences are archived").
   The "no hard DELETE grants" half of the rule is kept via `revoke delete`.
2. **No audit trigger.** `private.audit_log` is append-only with 6+ year retention and is
   exempt from purge. A user toggling the theme six times would write six permanent rows
   with zero investigative value. The `settings_change` action code is for **clinic-wide**
   settings that affect other people; these affect only the actor. Revisit only if a
   column with compliance meaning is ever added here.

### `public.clinic_branding` view (Phase 1.1)
`clinic_name`, `tagline`, `logo_url`, `brand_hue` — projected from `private.settings` keys
of the same names, each `coalesce`d so a fresh install returns exactly one row.

`private` is revoked from `anon`/`authenticated`, so this definer-rights view is **the only
public door** into settings. It must therefore never `select *` — only these four
non-secret keys. Granted `select` to `anon, authenticated` because the public landing page
and (Phase 9) the PWA manifest need it **without a session**.

Read through [src/lib/branding.ts](../../src/lib/branding.ts) → `getBranding()`: React
`cache()` for per-render dedupe plus a 5-minute module-level TTL memo that survives across
requests in a warm Worker isolate. OpenNext has no incremental cache configured yet, so
`unstable_cache` would have nowhere to persist — revisit in 2.2 when the branding screen
needs `revalidateTag`.

### `private.settings` keys seeded so far
`setup_superadmin_email` (0002, self-deleting), `clinic_name`, `brand_hue` (0004).

## Screens (routes)
- `/settings/appearance` — theme + text size ([page](../../src/app/settings/appearance/page.tsx)).
  **Public by design**: no PHI, and a guest partway through booking must be able to
  enlarge the text. Carries `roles: "public"` in `ROUTE_RULES`
  ([src/lib/roles.ts](../../src/lib/roles.ts)); longest-prefix-wins keeps it public under a
  future authenticated `/settings`.
- `AppearanceMenu` popover — mounted in `RoleHeader`, the landing page, and `/login`.
- Phase 2.2: `/admin/branding`, `/admin/lookups`, `/admin/email`.

## Rules & Invariants

1. **Cookies are the runtime source of truth**; the DB is the cross-device mirror.
   Cookies give SSR-correct first paint with no flash — the DB cannot, because reading it
   before first byte would put a cross-region round-trip on every request.
2. **DB wins on login, exactly once per browser session.** Middleware merges
   `user_preferences` into the cookies when `dc_prefsync` does not match the current user
   id, writing onto `request.cookies` so *this* render already uses them. `dc_prefsync` is
   a session cookie and is set even when no row exists, so users who never opened settings
   are not re-queried. Cost: one read per session per device, not per request.
3. Preference cookies (`dc_theme`, `dc_font`, `dc_prefsync`) are **`HttpOnly`** — the
   client never reads them; current values arrive as props and all writes go through the
   `savePreferences` server action. `SameSite=Lax`, not `Strict`, because patients arrive
   via tokenized email links and `Strict` would withhold the cookie on that entry.
4. `brand_hue` is **normalised into [0,360) on read**. This is a security control, not
   hygiene: the value is interpolated into an inline `style` attribute on `<html>` and
   will be superadmin-editable from 2.2.
5. Branding must never take the app down — `getBranding()` swallows errors and returns
   documented fallbacks (`DentClinic`, hue 195).
6. Changing `brand_hue` re-brands the entire app **with no rebuild and no CSS
   regeneration**. Verified live 2026-08-12 (flipped to 25 and back, no deploy).

## Role Access Matrix
| Action | Patient | Staff | Doctor | Superadmin |
|---|---|---|---|---|
| Read/update own preferences | ✔ | ✔ | ✔ | ✔ |
| Read anyone else's preferences | — | — | — | — |
| Read `clinic_branding` | ✔ (also anon) | ✔ | ✔ | ✔ |
| Edit branding / lookups / email settings | — | — | — | ✔ (Phase 2.2) |

## Open Questions
- Move `theme`/`font_size` into the JWT via the access-token hook to remove the
  once-per-session read entirely? Elegant, but it means touching the verified Phase 0.2
  auth hook and a stale token would fight local changes for up to 15 minutes.
  **Deferred to Phase 2** — the current cost is already ~one read per session.
- `reduce_motion` is stored and honoured in CSS (`html[data-reduce-motion]`) but has no UI
  control yet; add it to AppearancePanel when the Phase 10 motivation toggles land.
