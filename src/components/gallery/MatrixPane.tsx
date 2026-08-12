import { FONT_STEP_LABELS, type FontStep } from "@/lib/appearance";
import { cn } from "@/lib/utils";

/**
 * Renders a specimen under an explicit theme × font-size combination.
 *
 * Both axes nest because of how the tokens are built: `.dark` is a plain class
 * (so a nested element re-declares the lightness ladder for its subtree), and
 * the font-size selector is a BARE attribute selector with percentage values
 * (so a nested pane composes relative to its parent). An `html[data-font-size]`
 * selector would make this page impossible — see 02-typography.md.
 */
export function MatrixPane({
  theme,
  fontStep,
  children,
}: {
  theme: "light" | "dark";
  fontStep: FontStep;
  children: React.ReactNode;
}) {
  return (
    <div data-font-size={fontStep} className={cn(theme === "dark" && "dark")}>
      <div className="overflow-hidden rounded-lg border border-border bg-background text-foreground">
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
          <span className="text-xs font-medium capitalize text-muted-foreground">{theme}</span>
          <span className="text-xs text-muted-foreground">{FONT_STEP_LABELS[fontStep]}</span>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
