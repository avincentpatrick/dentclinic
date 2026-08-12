"use client";

import { useEffect, useRef } from "react";

/**
 * Draft-save seam for IdleTimeoutGuard.
 *
 * STILL ZERO REGISTRANTS as of Phase 2, deliberately. Phase 2's forms are ≤10
 * fields on one screen, `useActionState` echoes submitted values back across the
 * server round trip, `/register` posts each step so Back is loss-free, and
 * IdleTimeoutGuard warns 60s ahead with "Stay signed in". Draft persistence
 * would be machinery with nothing to protect.
 *
 * The first real registrant is Phase 6.1's MedicalHistoryForm (multi-step,
 * autosave, PLAN.md:152), followed by 6.2's SoapNoteEditor. Only the registry
 * ships now so that draft handling is never bolted onto the guard later.
 */

export type DraftSaver = () => void | Promise<void>;

const savers = new Set<DraftSaver>();

export function registerDraftSaver(fn: DraftSaver): () => void {
  savers.add(fn);
  return () => {
    savers.delete(fn);
  };
}

/** Register a saver for the lifetime of a component. */
export function useDraftSaver(fn: DraftSaver): void {
  const ref = useRef(fn);
  // Keep the ref current in an effect, not during render.
  useEffect(() => {
    ref.current = fn;
  });
  // Register once; the indirection through the ref means the registered
  // closure always calls the latest fn without re-registering.
  useEffect(() => registerDraftSaver(() => ref.current()), []);
}

export function draftSaverCount(): number {
  return savers.size;
}

/**
 * Run every registered saver. Never rejects and never exceeds `budgetMs` —
 * sign-out must not be blocked by a hanging save. A lost draft is recoverable;
 * a session that refuses to end on a clinic workstation is not.
 */
export async function flushDrafts(budgetMs = 2000): Promise<void> {
  if (savers.size === 0) return;
  await Promise.race([
    Promise.allSettled([...savers].map((fn) => Promise.resolve().then(fn))),
    new Promise((resolve) => setTimeout(resolve, budgetMs)),
  ]);
}
