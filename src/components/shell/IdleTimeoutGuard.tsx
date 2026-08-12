"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { signOut } from "@/app/actions/auth";
import { flushDrafts } from "@/lib/idle/drafts";

/**
 * Warn-then-logout on inactivity. Staff/doctor/superadmin 15 min, patient 30.
 *
 * This guard — not the JWT — is the real session control: supabase-js refreshes
 * the token in the background regardless of user activity, so a tab left open
 * on a clinic workstation never expires on its own.
 */
export function IdleTimeoutGuard({
  idleMs,
  warnMs = 60_000,
}: {
  idleMs: number;
  warnMs?: number;
}) {
  // 0 = not yet initialised; seeded on mount. Date.now() during render is
  // impure and would produce a different value on every re-render.
  const lastActivity = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const expiring = useRef(false);
  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(warnMs);

  const expire = useCallback(async () => {
    if (expiring.current) return;
    expiring.current = true;
    // Tell siblings first so they navigate immediately rather than sitting on
    // a dead session while this tab awaits the server.
    channel.current?.postMessage({ t: "logout" });
    await flushDrafts(2000);
    await signOut();
  }, []);

  const extend = useCallback(() => {
    lastActivity.current = Date.now();
    setWarning(false);
    channel.current?.postMessage({ t: "activity", at: lastActivity.current });
  }, []);

  // Multi-tab sync. BroadcastChannel only — no localStorage/sessionStorage,
  // which keeps us inside the "never localStorage" rule and is the better
  // primitive anyway (ephemeral, same-origin, nothing persisted).
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return; // degrade to per-tab (stricter, fail-safe)
    const ch = new BroadcastChannel("dc-idle");
    channel.current = ch;
    ch.onmessage = (event: MessageEvent) => {
      const msg = event.data as { t: string; at?: number };
      if (msg.t === "activity" && typeof msg.at === "number") {
        lastActivity.current = Math.max(lastActivity.current, msg.at);
        setWarning(false);
      } else if (msg.t === "logout") {
        // Deliberately a hard navigation, not router.push: another tab has
        // just destroyed the session, so this tab's Supabase client and RSC
        // cache are stale. A full document load is the only clean slate.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      }
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  // Activity listeners. mousemove is DELIBERATELY excluded: in a clinic a mouse
  // gets bumped by a sleeve, a chart, a patient leaning on the desk — listening
  // for it means the guard never fires on the workstation it exists to protect.
  // pointerdown covers mouse, touch and pen.
  useEffect(() => {
    let lastBroadcast = 0;
    function onActivity() {
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastBroadcast > 5000) {
        lastBroadcast = now;
        channel.current?.postMessage({ t: "activity", at: now });
      }
    }
    const events = ["pointerdown", "keydown", "wheel", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
  }, []);

  // Everything derives from wall-clock elapsed time rather than timer accuracy,
  // so background-tab throttling can only make logout LATE, never wrong. The
  // visibilitychange tick means a stale tab signs out before it can be used.
  useEffect(() => {
    function tick() {
      if (lastActivity.current === 0) {
        lastActivity.current = Date.now();
        return;
      }
      const idle = Date.now() - lastActivity.current;
      if (idle >= idleMs) {
        void expire();
        return;
      }
      const left = idleMs - idle;
      setWarning(left <= warnMs);
      setRemainingMs(left);
    }
    tick();
    const interval = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [idleMs, warnMs, expire]);

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  // Announce only at 30s and 10s. A per-second live region is hostile.
  const announce = seconds === 30 || seconds === 10 ? `Signing out in ${seconds} seconds.` : "";

  return (
    <AlertDialog open={warning}>
      {/* No outside-click or Escape dismissal: a timeout warning that vanishes
          on a stray click is worse than no warning at all. */}
      <AlertDialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="motion-reduce:animate-none"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll be signed out in about a minute to protect patient privacy.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Visible countdown is decorative; the description above carries the
            meaning for assistive tech. */}
        <p aria-hidden="true" className="text-center text-2xl font-semibold tabular-nums text-foreground">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </p>
        <span aria-live="polite" className="sr-only">
          {announce}
        </span>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void expire()} className="min-h-11">
            Sign out now
          </AlertDialogCancel>
          <AlertDialogAction autoFocus onClick={extend} className="min-h-11">
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
