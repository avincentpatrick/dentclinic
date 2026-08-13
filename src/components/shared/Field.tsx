import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * One form field: label, control, hint, error — wired together correctly once,
 * so no call site has to remember `aria-describedby`.
 *
 * It exists for two reasons beyond convenience.
 *
 * 1. **It owns the sizing floor.** `components/ui/input.tsx` ships shadcn's
 *    `h-8` (2rem) and `md:text-sm` (0.875rem). Both violate rules this project
 *    treats as binding: 2.75rem minimum target (WCAG 2.5.8, and the codebase
 *    holds 44px rather than the 24px minimum), and never below 1rem on a form
 *    control or iOS zooms the viewport on focus. Same class of defect as the
 *    destructive-button contrast bug found in 1.2 — an upstream default that is
 *    wrong for this app. Fixing it here rather than in the primitive keeps
 *    `shadcn add` non-destructive.
 *
 * 2. **The error is announced, and the control says it is invalid.** Those are
 *    two different mechanisms (`role="alert"` on the message, `aria-invalid` on
 *    the control) and shipping one without the other is the usual bug.
 *
 * Native controls throughout — `<select>`, `<input type="checkbox">`,
 * `<input type="date">` — for most of the reasons AppearancePanel uses native
 * radios: the platform picker on mobile, no roving-focus implementation to get
 * wrong, and the widest assistive-tech support. NOT for progressive
 * enhancement: useActionState forms require JavaScript whatever controls they
 * contain (docs/design-system/05-patterns/forms.md).
 */

type Option = { value: string; label: string };

type Common = {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export type FieldProps = Common &
  (
    | {
        as?: "input";
        type?: "text" | "email" | "tel" | "date" | "number" | "url";
        defaultValue?: string;
        placeholder?: string;
        autoComplete?: string;
        inputMode?: "text" | "email" | "tel" | "numeric" | "decimal";
        min?: string | number;
        max?: string | number;
        options?: never;
        rows?: never;
      }
    | {
        as: "textarea";
        defaultValue?: string;
        placeholder?: string;
        rows?: number;
        type?: never;
        options?: never;
        autoComplete?: string;
        inputMode?: never;
        min?: never;
        max?: never;
      }
    | {
        as: "select";
        defaultValue?: string;
        options: readonly Option[];
        placeholder?: string;
        type?: never;
        rows?: never;
        autoComplete?: string;
        inputMode?: never;
        min?: never;
        max?: never;
      }
    | {
        as: "checkbox";
        defaultChecked?: boolean;
        type?: never;
        options?: never;
        rows?: never;
        defaultValue?: never;
        placeholder?: never;
        autoComplete?: never;
        inputMode?: never;
        min?: never;
        max?: never;
      }
  );

/** The 44px + 1rem floor. `md:text-base` is what cancels the primitive's `md:text-sm`. */
const CONTROL = "min-h-11 text-base md:text-base";

export function Field(props: FieldProps) {
  const { name, label, hint, error, required, disabled, className } = props;
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  // Shared across every control shape. `required` is advisory: forms carry
  // `noValidate` so the server is the single source of truth for what is
  // acceptable, which keeps the messages identical with and without JS.
  const a11y = {
    id: name,
    name,
    disabled,
    "aria-describedby": describedBy,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-required": required || undefined,
  };

  if (props.as === "checkbox") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {/* The whole row is the label, so the tap target is the text too, not a
            16px box. */}
        <label
          htmlFor={name}
          className="flex min-h-11 cursor-pointer items-center gap-3 text-base"
        >
          <input
            type="checkbox"
            defaultChecked={props.defaultChecked}
            className="size-5 shrink-0 accent-primary"
            {...a11y}
          />
          <span>{label}</span>
        </label>
        {hint && (
          <p id={hintId} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-sm font-medium text-destructive-on-soft">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <>
            {" "}
            <span className="text-muted-foreground">(required)</span>
          </>
        )}
      </label>

      {props.as === "textarea" ? (
        <Textarea
          rows={props.rows ?? 3}
          defaultValue={props.defaultValue}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          className="text-base md:text-base"
          {...a11y}
        />
      ) : props.as === "select" ? (
        <select
          defaultValue={props.defaultValue ?? ""}
          autoComplete={props.autoComplete}
          className={cn(
            "w-full rounded-lg border border-input bg-transparent px-2.5 transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            "dark:bg-input/30",
            CONTROL,
          )}
          {...a11y}
        >
          {props.placeholder && (
            <option value="" disabled>
              {props.placeholder}
            </option>
          )}
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          type={props.type ?? "text"}
          defaultValue={props.defaultValue}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          min={props.min}
          max={props.max}
          className={CONTROL}
          {...a11y}
        />
      )}

      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive-on-soft">
          {error}
        </p>
      )}
    </div>
  );
}
