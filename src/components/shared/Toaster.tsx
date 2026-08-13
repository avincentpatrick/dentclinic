"use client";

import { Toaster as Sonner } from "sonner";

/**
 * The app's single toast surface, mounted once in AppShell.
 *
 * NOT `npx shadcn add sonner`. That template imports `useTheme` from
 * `next-themes`, which this repo deliberately does not use: theme is a cookie
 * plus a `.dark` class on <html>, resolved entirely in CSS so it survives
 * JavaScript being off and needs no blocking script (Phase 1.1). Adding
 * next-themes to style a toast would reintroduce the flash that whole design
 * exists to prevent.
 *
 * So sonner's own theming stays pinned to "light" and does nothing: the colours
 * come from our custom properties instead, and custom properties resolve where
 * they are DECLARED — under `:root, .dark` — so the same three variables give
 * the right answer in both themes with no JS involved. It also means the toast
 * is covered by `check:contrast` like everything else, rather than carrying
 * sonner's own palette that nothing verifies.
 */
export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      closeButton
      // WCAG 2.2.1: a disappearing Undo is a time limit. 10s rather than the
      // 4s default, sonner pauses on hover and focus, and the durable path
      // (Archived filter -> row menu -> Restore) has no time limit at all.
      duration={10_000}
      // Must clear the BottomTabBar (h-16) and the home indicator, or the Undo
      // button lands under the nav on a phone.
      mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          actionButton: "min-h-11 px-3",
          closeButton: "size-11",
        },
      }}
    />
  );
}
