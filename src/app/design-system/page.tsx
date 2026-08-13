import type { Metadata } from "next";
import { Suspense } from "react";
import { GalleryControls } from "@/components/gallery/GalleryControls";
import { MatrixPane } from "@/components/gallery/MatrixPane";
import { registry } from "@/components/gallery/registry";
import { GALLERY_GROUPS, GROUP_LABELS, parseGroup } from "@/components/gallery/groups";
import { AppearancePanel } from "@/components/theme/AppearancePanel";
import { FONT_STEPS, type FontStep } from "@/lib/appearance";

export const metadata: Metadata = { title: "Design system" };

const THEMES = ["light", "dark"] as const;

export default async function DesignSystemPage({ searchParams }: PageProps<"/design-system">) {
  const params = await searchParams;
  const matrix = params.matrix === "all";

  /**
   * `?group=` narrows the page to one group. The matrix renders every specimen
   * across 2 themes × 4 font steps, so the full page grew past what axe-core can
   * analyse in one pass — it timed out at 30s and then crashed the browser
   * process, taking the next test with it. Chunking by group keeps each axe run
   * small and keeps coverage total, and it scales as the gallery grows rather
   * than needing the timeout raised again every phase.
   */
  const only = parseGroup(params.group);
  const groups = only ? [only] : GALLERY_GROUPS;

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Design system</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every custom component, in every variant. Switch to{" "}
        <strong className="font-medium text-foreground">All themes × sizes</strong> to see each
        specimen rendered across both themes and all four font steps at once — that combined view
        is what the axe run and the acceptance criteria target.
      </p>

      <div className="mt-6">
        <Suspense fallback={null}>
          <GalleryControls />
        </Suspense>
      </div>

      <section aria-labelledby="appearance-heading" className="mt-10">
        <h2 id="appearance-heading" className="text-xl font-semibold">
          Appearance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The real control, wired to the real cookie + database path — not a mock.
        </p>
        <div className="mt-4 max-w-md rounded-lg border border-border p-4">
          <AppearancePanel variant="page" signedIn />
        </div>
      </section>

      {groups.map((group) => {
        const entries = registry.filter((e) => e.group === group);
        if (entries.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`group-${group}`} className="mt-14">
            <h2 id={`group-${group}`} className="text-xl font-semibold">
              {GROUP_LABELS[group]}
            </h2>
            <div className="mt-4 space-y-10">
              {entries.map((entry) => (
                <article key={entry.id} id={entry.id} aria-labelledby={`entry-${entry.id}`}>
                  <h3 id={`entry-${entry.id}`} className="text-lg font-medium">
                    {entry.name}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{entry.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <code>{entry.doc}</code>
                  </p>

                  {entry.specimens.length === 0 ? (
                    <p className="mt-3 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                      Rendered live in the shell around this page — see the doc for anatomy and states.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-6">
                      {entry.specimens.map((specimen) => (
                        <div key={specimen.name}>
                          <h4 className="text-sm font-medium text-foreground">{specimen.name}</h4>
                          {specimen.note && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{specimen.note}</p>
                          )}
                          {matrix ? (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              {THEMES.flatMap((theme) =>
                                FONT_STEPS.map((step: FontStep) => (
                                  <MatrixPane key={`${theme}-${step}`} theme={theme} fontStep={step}>
                                    {specimen.render()}
                                  </MatrixPane>
                                )),
                              )}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-lg border border-border p-4">
                              {specimen.render()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
