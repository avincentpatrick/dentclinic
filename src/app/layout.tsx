import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { AppearanceProvider } from "@/components/theme/AppearanceProvider";
import { getBranding } from "@/lib/branding";
import {
  FONT_COOKIE,
  THEME_COOKIE,
  parseFontPref,
  parseTheme,
  resolveFontStep,
} from "@/lib/appearance";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DentClinic",
    template: "%s · DentClinic",
  },
  description: "Book and manage your dental care.",
};

export const viewport: Viewport = {
  // Required for env(safe-area-inset-*) — the bottom tab bar lands in Phase 1.2.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [jar, hdrs, branding] = await Promise.all([cookies(), headers(), getBranding()]);

  const pathname = hdrs.get("x-pathname") ?? "/";
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const fontPref = parseFontPref(jar.get(FONT_COOKIE)?.value);
  const fontStep = resolveFontStep(fontPref, pathname);

  return (
    <html
      lang="en"
      // The tokens resolve entirely in CSS — `.dark` for an explicit choice,
      // prefers-color-scheme for "system" — so there is no theme script and
      // nothing here is guessed. suppressHydrationWarning is defensive only:
      // extensions (Dark Reader, Grammarly) mutate <html> before hydration.
      suppressHydrationWarning
      data-theme={theme}
      data-font-size={fontStep}
      style={{ "--brand-hue": String(branding.brandHue) } as React.CSSProperties}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${theme === "dark" ? " dark" : ""}`}
    >
      <body className="flex min-h-full flex-col">
        <AppearanceProvider initialTheme={theme} initialFontPref={fontPref}>
          {children}
        </AppearanceProvider>
      </body>
    </html>
  );
}
