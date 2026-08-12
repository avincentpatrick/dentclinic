"use client";

import { useRef, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { savePreferences } from "@/app/actions/preferences";
import { useAppearance } from "@/components/theme/AppearanceProvider";
import {
  FONT_PREFS,
  FONT_STEP_LABELS,
  FONT_STEP_PERCENT,
  THEMES,
  type FontPref,
  type Theme,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

const THEME_META: Record<Theme, { label: string; Icon: typeof Sun }> = {
  light: { label: "Light", Icon: Sun },
  dark: { label: "Dark", Icon: Moon },
  system: { label: "System", Icon: Monitor },
};

function fontLabel(pref: FontPref): string {
  return pref === "auto" ? "Automatic" : FONT_STEP_LABELS[pref];
}

export type AppearancePanelProps = {
  variant?: "page" | "compact";
  /** Shown only in `page` variant; the caller knows whether there's a session. */
  signedIn?: boolean;
  className?: string;
};

/**
 * Native <fieldset> + radios styled as segmented controls — deliberately not a
 * Radix RadioGroup. Native radios give arrow-key roving focus, group labelling,
 * and correct form submission when JavaScript is disabled, all for free.
 */
export function AppearancePanel({ variant = "page", signedIn = false, className }: AppearancePanelProps) {
  const { theme, fontPref, fontStep, setTheme, setFontPref } = useAppearance();
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();

  function persist() {
    startTransition(() => formRef.current?.requestSubmit());
  }

  const compact = variant === "compact";

  return (
    <form
      ref={formRef}
      action={savePreferences}
      className={cn("flex flex-col gap-6", compact && "gap-4", className)}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className={cn("mb-2 font-medium", compact ? "text-sm" : "text-base")}>Theme</legend>
        <div className="grid grid-cols-3 gap-2" role="none">
          {THEMES.map((value) => {
            const { label, Icon } = THEME_META[value];
            const checked = theme === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border p-3",
                  "min-h-[2.75rem] text-center text-sm transition-colors",
                  "hover:bg-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
                  checked ? "border-primary bg-accent font-medium text-foreground" : "border-input text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={checked}
                  onChange={() => {
                    setTheme(value);
                    persist();
                  }}
                  className="sr-only"
                />
                <Icon aria-hidden="true" className="size-5" />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={cn("mb-2 font-medium", compact ? "text-sm" : "text-base")}>Text size</legend>
        <div className="flex flex-col gap-1.5">
          {FONT_PREFS.map((value) => {
            const checked = fontPref === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5",
                  "min-h-[2.75rem] text-sm transition-colors",
                  "hover:bg-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
                  checked ? "border-primary bg-accent text-foreground" : "border-input text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name="fontSize"
                  value={value}
                  checked={checked}
                  onChange={() => {
                    setFontPref(value);
                    persist();
                  }}
                  className="size-4 accent-primary"
                />
                <span className={cn(checked && "font-medium")}>{fontLabel(value)}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {value === "auto" ? FONT_STEP_LABELS[fontStep] : FONT_STEP_PERCENT[value]}
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Automatic uses larger text on patient pages for easier reading.
        </p>
      </fieldset>

      {!compact && !signedIn && (
        <p className="text-xs text-muted-foreground">
          Saved on this device. Sign in to sync your preferences across devices.
        </p>
      )}

      {/* Works without JavaScript; hidden once JS enhances the controls. */}
      <noscript>
        <button
          type="submit"
          className="min-h-[2.75rem] rounded-md bg-primary px-4 font-medium text-primary-foreground"
        >
          Save preferences
        </button>
      </noscript>
    </form>
  );
}
