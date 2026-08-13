# Accessibility

> LIVE since Phase 1.2. The floor is defined in [00-principles.md](00-principles.md);
> this is how it is **enforced**. Expanded through Phase 9's full WCAG sweep.

Target: **WCAG 2.2 AA**, verified in both themes at all four font steps.

## Two automated gates — complementary, not redundant

The first person to see both will want to delete one. Don't: neither can see what the other sees.

| | `npm run check:contrast` | `npm run test:a11y` |
|---|---|---|
| What | Token palette maths | Real rendered pages |
| Tool | Node + culori, no browser | Playwright + axe-core |
| Covers | **All 360 brand hues** × 2 themes × 52 declared pairs | Actual DOM, ARIA, computed styles |
| Misses | Bad *compositions* (`text-muted-foreground` on `bg-primary`) | Every hue except the one rendered |
| Cost | ~1s | ~30s + browser download |

`--brand-hue` is a **runtime clinic setting**. A browser check proves one hue; the palette
sweep proves all of them. Conversely a palette sweep cannot know that someone put a muted
foreground on a primary background. Both, always.

### Running them

```bash
npm run check:contrast     # palette, ~1s
npm run test:a11y          # axe + keyboard (needs an OpenNext build first)
npm run check              # lint + typecheck + contrast + docs sync + route coverage
npm run verify             # everything, exactly as CI runs it
```

> **Corrected 2026-08-14.** This paragraph claimed *"GitHub Actions is still blocked by the
> account's billing state"* and that *"CI will not run these until that is resolved"*. That
> stopped being true on 2026-08-13, when the repo was made public and Actions became free —
> `PROGRESS.md` has recorded CI as green end to end since. Left visible rather than deleted,
> in the same register as the `layouts`-group correction below: a doc that describes the
> project's gating as broken when it is not is how someone concludes the gates do not matter.

Every gate is nevertheless a local npm script, and that is the load-bearing design: `npm run
verify` reproduces CI **offline**, and it is the last thing between a regression and the
deployed URL. Keep it that way — a gate that only exists in a workflow file cannot be run
before you commit.

`npm run test:authed` is deliberately **not** part of `verify` (see below): it needs a
service-role key and the network, and `verify`'s offline claim is worth more than the extra
coverage in that one command. It belongs to the session-end ritual instead.

## The audit bypass — and why it cannot reach production

`/design-system` is superadmin-gated, but axe needs to reach it without a session.
Authenticating Playwright against live Supabase would need real credentials and hand-forged
chunked `sb-*-auth-token` cookies — fragile and slow.

**Since Phase 2.2a** the gallery carries a `layouts` group: whole-page compositions built from
the same hard-coded fixtures, which is how admin screens get axe coverage without a second
bypass route.

> This paragraph previously claimed the group had existed "since Phase 2". It had not — no
> such group existed until 2.2a, and no authenticated route was axe-tested at all. It was
> found and corrected while planning 2.2a. Recorded rather than quietly rewritten, in the
> same register as the six docs corrected in the 2026-08-13 session for overstating the
> no-JS guarantee: a doc that describes coverage the suite does not have is worse than one
> that admits the gap, because it stops anyone looking.

What the group **proves**: heading order, contrast and layout of the assembled page, across
both themes and all four font steps, on every `npm run test:a11y`.

> **A trap for anyone writing browser-driven checks against these forms.**
> Playwright's `fill()` on a **React uncontrolled `<textarea>` with a `defaultValue`** *prepends*
> rather than replaces: the field ends up holding the typed text followed by the old value, and a
> save then stores the concatenation. It cost real time during the 2.2b acceptance run because
> the symptom — "the save reports success but the wrong value is in the database" — looks exactly
> like a product bug. `fill()` on a plain `<input>` is fine, and click → select-all → `type()` on
> the same textarea stores exactly what was typed. **Use select-all + type for textareas.**

What it **does not prove**: the real data path; row menus, whose props are server actions
(which is why the `SoftDeleteMenu` entry has no specimens); and the authenticated shell
around the page.

## The authenticated suite — LIVE since 2.2d

`npm run test:authed` signs in as a real superadmin and a real patient, visits **every**
authenticated route including the dynamic ones, and asserts three things per route: HTTP 200
from the response object, exactly one non-empty `<h1>`, and an axe pass. It also asserts the
other direction — that a patient hitting `/admin` lands on `/home`, and a superadmin hitting
`/home` lands on `/dashboard`.

**It exists because 2.2b shipped six routes that returned 500 to every superadmin who opened
them, past a fully green `npm run verify`** (PROGRESS decision 22). A 500 renders no `<h1>`,
which is what makes the heading assertion catch that whole class. Before it was trusted, the
decision-22 bug was deliberately reintroduced and the suite confirmed to catch it — along with
a bogus route, an inverted role assertion and an emptied storageState.

Two things this doc previously assumed, both wrong and worth recording:

- **It does not need hand-forged chunked `sb-*-auth-token` cookies.** `/auth/confirm` is
  already a public route handler that calls `verifyOtp` on a `token_hash`, so replaying an
  admin-generated magic link makes *the app* mint its own session. Nothing in the fixture knows
  how Supabase stores a session, which is what stops it breaking when that changes.
- **It is not slow.** 42 checks in about a minute.

One local-only trap, measured while building it: on the standalone server a **route handler's**
`NextResponse.redirect` serialises as an absolute URL whose host is `localhost`, while
middleware's serialises relative. With `baseURL` at `127.0.0.1` that hop crosses an origin, so
the session cookie is set correctly and then simply not sent — which looks exactly like a
rejected token and is not. The fixture therefore does not follow that redirect. Production is
unaffected: on Workers the incoming request URL is absolute with the real host.

**It is opt-in, and silence about that would be the bug.** `playwright.config.ts` omits the
projects entirely unless `SUPABASE_SERVICE_ROLE_KEY` is set — nothing in the test path loads
`.env.local`, so `npm run verify` stays offline — and it prints a line saying so every time it
does. A gate that quietly does not run is worse than no gate, because its absence reads as a
pass (PROGRESS decision 25).

Not in CI, by choice: the repo is public, and a service-role key in Actions secrets is a
bigger change than the coverage is worth right now.

Instead, `A11Y_AUDIT=1` bypasses the gate. Four independent reasons it is safe:

1. **The check lives in a Server Component** (`src/app/design-system/layout.tsx`), not in
   middleware. Middleware runs in the Edge runtime where Next **inlines `process.env` at
   build time** — a bypass there would be baked into the artifact. A Server Component reads
   `process.env` at **runtime** on Workers.
2. `A11Y_AUDIT` is **not in `wrangler.jsonc` vars** and is not a secret, so on the deployed
   Worker it is `undefined` — regardless of how the artifact was built.
3. **Blast radius is zero by construction**: the gallery renders only hard-coded fixtures.
   Enforced by an eslint `no-restricted-imports` rule banning `@/lib/supabase/*` and
   `@/app/actions/*` from `src/components/gallery/**`, not by discipline.
4. `scripts/assert-no-bypass.mjs` fails `npm run deploy` if the flag is set.

CI has no deploy job. **If one is ever added**, split the a11y build into its own `distDir`
so the audit artifact can never be the deployed one (~60s extra).

## Success criteria and where each is handled

| SC | Requirement | Where |
|---|---|---|
| 1.4.3 Contrast (Minimum) | 4.5:1 text | `contrast-pairs.mjs`, all hues + axe |
| 1.4.11 Non-text Contrast | 3:1 controls | `--input` is a separate token from `--border` at 3:1 — stock shadcn uses one at ~1.3:1 and fails this |
| 1.4.4 Resize Text | 200% without loss | 4 font steps, everything in rem |
| 2.1.1 Keyboard | all functionality | `tests/a11y/keyboard.spec.ts` |
| 2.2.1 Timing Adjustable | extend before timeout | IdleTimeoutGuard: 60s warning + "Stay signed in" |
| 2.4.11 Focus Not Obscured | focus never hidden | `html { scroll-padding-bottom: calc(4rem + env(safe-area-inset-bottom)) }` |
| 2.5.8 Target Size | ≥24px (we hold 44px) | `min-h-11` everywhere; asserted in the keyboard spec |
| 1.4.1 Use of Colour | never colour alone | StatusChip = chip+label+icon; nav active = bar+weight+colour |
| 2.3.3 Animation from Interactions | respect reduced motion | global `prefers-reduced-motion` block + `html[data-reduce-motion]` opt-in |

## Rules that are easy to get wrong

- **Hide with `display:none`, never `opacity`/`visibility`.** The mobile and desktop navs
  both render; only `display:none` removes a subtree from the accessibility tree. Anything
  else gives screen-reader users a duplicate navigation.
- **Two navs need two distinct `aria-label`s** or `landmark-unique` fires.
- **Empty-state titles are `<p>`, not headings** — they sit inside someone else's section
  and would break `heading-order`.
- **One `<h1>` per route, from `PageHeader`.** The shell has no heading, so the outline
  always starts at the page.
- **Icons inside a labelled chip/button are `aria-hidden`** — otherwise everything is
  announced twice.
- **Form controls never below `1rem`** or iOS zooms on focus.
- **Breakpoints do not scale with the font step** (`rem` in a media query is always 16px).
  Prefer `@container` for component-level responsiveness.

## Not yet covered (Phase 9)

Screen-reader passes on real devices (VoiceOver/TalkBack), the booking-flow keyboard walk,
redundant-entry across booking steps, and the full both-themes × four-sizes manual sweep.
