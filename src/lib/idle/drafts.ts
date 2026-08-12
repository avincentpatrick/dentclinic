"use client";

import { useEffect, useRef } from "react";

/**
 * Draft-save seam for IdleTimeoutGuard.
 *
 * Phase 1 has ZERO registrants — there are no forms yet. Only the registry
 * ships, so that Phase 2's MedicalHistoryForm and Phase 6's SoapNoteEditor get
 * idle-timeout protection by calling useDraftSaver(), rather than someone
 * bolting draft handling onto the guard later.
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
