import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  title: string;
  description?: string;
  /** Primary page action(s). Kept top-right on desktop, stacked on mobile. */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * The single <h1> for a page. Every route under the app shell renders exactly
 * one — the shell itself deliberately has none, so the heading outline always
 * starts here and section headings can safely be <h2>.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
