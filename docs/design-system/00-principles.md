# Design Principles

The product principles — frictionless, gamified, global search, workflow-centric, connected, dashboard-driven — translate into these binding UI rules.

## Frictionless
- Patient booking: ≤3 screens, <7 fields for a logged-in patient; "First available" is the default provider; "Book again" repeats the last visit in one tap.
- Never require login for confirm/cancel/reschedule from email — tokenized links.
- Multi-step forms only when >7 fields (new-patient registration, medical history) — named steps, back-navigation without data loss, autosave.
- Defer data collection: booking captures the minimum to hold the chair; medical history arrives via a pre-visit link.

## Thumb-first mobile
- Patients: bottom tab bar (`Home · Appointments · [+Book] · Records · Profile`), booking FAB center. Staff/doctor mobile: `Today · Schedule · Patients · Search · More`. Desktop: collapsible sidebar (256px / 56px rail / sheet, cookie-persisted).
- Primary CTAs: sticky, bottom thumb zone, ≥44px targets. Destructive actions get deliberate friction (top placement + confirm sheet) — intentional in a medical app.

## Honest feedback
- Skeletons (component-sibling files) for content; in-button spinners for actions; **no optimistic UI for booking or clinical writes — ever.** Optimistic only for low-risk toggles.
- Empty states are components with 3 registers: first-use (directive CTA), user-cleared (affirming), error (calm + retry).

## Connected & status-truthful
- Status is always chip + label + icon (`StatusChip`) — never color alone. Colors come from `--status-*` / `--clinical-*` tokens only.
- Everything links: an appointment card reaches the patient, the invoice, the note; dashboards drill through to actionable lists.

## Theming & preferences
- Two axes: `--brand-hue` (single number from clinic settings) × `.dark`. Font size: 4 root steps (100/112.5/125/137.5%); patient routes default 112.5% (18px). Everything in rem.
- Preferences persist in cookies (SSR-correct first paint) mirrored to DB (cross-device; DB wins on login). Three-way Light/Dark/System.

## Accessibility floor (WCAG 2.2 AA)
- 4.5:1 body contrast verified in both themes (CI); focus never obscured by sticky CTAs; no redundant entry across booking steps; `prefers-reduced-motion` disables all celebration/shimmer animation; slot chips carry full accessible names ("10:30 AM, available, 45 minute cleaning").

## Gamification (ownership over accomplishment)
- Ship: completeness ring, checkup-cadence tracker, treatment progress, provider-endorsed milestones. Optional toggles: streaks (2 silent monthly freezes, longest-streak framing), kids brush timer.
- Never: public leaderboards, red guilt UI, confetti on medical events, gamification as the only path to information. Everything degrades to plain status when toggled off.

## Documentation contract
- Every custom component: a doc in `04-components/` (Anatomy → Variants → Props → States → A11y → Do/Don't → Example) **written when the component is built**, plus an entry in the admin-gated `/design-system` live gallery rendering it in every variant × theme × font size.
