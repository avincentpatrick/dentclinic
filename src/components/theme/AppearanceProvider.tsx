"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  type FontPref,
  type FontStep,
  type Theme,
  resolveFontStep,
} from "@/lib/appearance";

type AppearanceValue = {
  theme: Theme;
  fontPref: FontPref;
  /** What is actually on <html>, after `auto` is resolved for this route. */
  fontStep: FontStep;
  /** `system` resolved against the OS. Needed by charts/gallery, not by tokens. */
  resolvedTheme: "light" | "dark";
  setTheme: (next: Theme) => void;
  setFontPref: (next: FontPref) => void;
};

const AppearanceContext = createContext<AppearanceValue | null>(null);

export function useAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside <AppearanceProvider>");
  return value;
}

/** Applied synchronously on change so the UI never waits on the server. */
function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.classList.toggle("dark", theme === "dark");
}

function applyFontStep(step: FontStep) {
  document.documentElement.dataset.fontSize = step;
}

export function AppearanceProvider({
  initialTheme,
  initialFontPref,
  children,
}: {
  initialTheme: Theme;
  initialFontPref: FontPref;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [fontPref, setFontPrefState] = useState<FontPref>(initialFontPref);
  const [systemDark, setSystemDark] = useState(false);

  const fontStep = resolveFontStep(fontPref, pathname);

  // The root layout does not re-render on client navigation, so a server-set
  // data-font-size would go stale when moving between patient and staff
  // surfaces under `auto`. Server gets first paint right; this keeps it right.
  useEffect(() => {
    applyFontStep(fontStep);
  }, [fontStep]);

  // Only for consumers that need the *resolved* theme (Phase 8 charts, the
  // Phase 1.2 gallery). Tokens never need it — CSS resolves system itself.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const setFontPref = useCallback((next: FontPref) => {
    setFontPrefState(next);
  }, []);

  const value = useMemo<AppearanceValue>(
    () => ({
      theme,
      fontPref,
      fontStep,
      resolvedTheme: theme === "system" ? (systemDark ? "dark" : "light") : theme,
      setTheme,
      setFontPref,
    }),
    [theme, fontPref, fontStep, systemDark, setTheme, setFontPref],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
