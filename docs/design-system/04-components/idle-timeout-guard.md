# IdleTimeoutGuard

> Built in Phase 1.2. [src/components/shell/IdleTimeoutGuard.tsx](../../../src/components/shell/IdleTimeoutGuard.tsx) · [gallery](/design-system#idle-timeout-guard)

Warn-then-logout after inactivity. Mounted once by `AppShell`.

**This guard — not the JWT — is the real session control.** supabase-js refreshes the token
in the background regardless of user activity, so a tab left open on a clinic workstation
never expires on its own. The 15-minute JWT lifetime is not a session timeout.

## Anatomy
```
(headless)                     activity listeners + wall-clock tick + BroadcastChannel
  └── AlertDialog              shown for the last `warnMs`
       ├── title/description   static, screen-reader friendly
       ├── countdown           aria-hidden, decorative
       ├── "Sign out now"
       └── "Stay signed in"    autoFocus
```

## Variants
By role, via `IDLE_MS`: patient **30 min**; staff, doctor, superadmin **15 min**.
Superadmin is 15 because it is the most privileged account (PLAN only specified staff and
patient).

## Props
| Prop | Type | Default |
|---|---|---|
| `idleMs` | `number` | required |
| `warnMs` | `number` | `60_000` |

## States
Idle-counting (invisible) · warning (dialog) · expiring (flush drafts → `signOut()`) ·
remote logout (a sibling tab expired).

## A11y
- `AlertDialog` — `role="alertdialog"`, focus trapped, **Escape and outside-click disabled**:
  a timeout warning that vanishes on a stray click is worse than no warning.
- Countdown is `aria-hidden`; a polite live region announces only at 30s and 10s. Announcing
  every second is hostile.
- Satisfies **WCAG 2.2 SC 2.2.1 Timing Adjustable** via the extend path: ≥20s warning plus a
  single-action extension. That is why the warning exists rather than a silent logout.
- `motion-reduce:animate-none`; no progress ring or pulse.

## Do / Don't
**Do** register autosave via `useDraftSaver()` — it is flushed (with a 2s budget) before
sign-out.
**Do** rely on wall-clock elapsed time, not timer accuracy: background tabs throttle timers,
so `Date.now() - lastActivity` means a late tick can only log out *late*, never wrongly.

**Don't** add `mousemove` to the activity events. In a clinic the mouse gets bumped by a
sleeve, a chart, a patient leaning on the desk — listening for it means the guard never
fires on exactly the workstation it exists to protect. `pointerdown` covers mouse, touch
and pen.
**Don't** persist idle state to localStorage. Cross-tab sync is `BroadcastChannel` only —
ephemeral, same-origin, nothing written to disk (and it satisfies AGENTS.md outright).
**Don't** auto-dismiss the warning on activity; dismissal must be an explicit choice.

## Example
```tsx
<IdleTimeoutGuard idleMs={IDLE_MS[role]} warnMs={IDLE_WARN_MS} />

// In a form, Phase 2+:
useDraftSaver(() => saveDraft(values));
```
