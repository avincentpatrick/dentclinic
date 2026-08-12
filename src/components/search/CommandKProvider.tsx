"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppRole } from "@/lib/roles";

/**
 * cmdk is lazy-loaded and never server-rendered: it is not in the initial
 * client chunk and not in the Worker render path. `ssr: false` is legal here
 * because this provider is itself a Client Component; `children` is an RSC
 * payload and passes straight through.
 */
const CommandPalette = dynamic(
  () => import("@/components/search/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false },
);

type CommandKValue = { open: () => void; close: () => void };

const CommandKContext = createContext<CommandKValue | null>(null);

export function useCommandK(): CommandKValue {
  const value = useContext(CommandKContext);
  if (!value) throw new Error("useCommandK must be used inside <CommandKProvider>");
  return value;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

export function CommandKProvider({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Stays true after the first open so the chunk is fetched once.
  const [mounted, setMounted] = useState(false);

  const openPalette = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
        return;
      }
      // "/" is a convention users expect, but only outside a text field.
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        openPalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  const value = useMemo<CommandKValue>(
    () => ({ open: openPalette, close: () => setOpen(false) }),
    [openPalette],
  );

  return (
    <CommandKContext.Provider value={value}>
      {children}
      {mounted && <CommandPalette role={role} open={open} onOpenChange={setOpen} />}
    </CommandKContext.Provider>
  );
}
