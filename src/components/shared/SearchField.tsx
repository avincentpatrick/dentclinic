"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Roster search. A GET form, so the query lands in the URL where the server can
 * read it — which is what makes the result shareable, bookmarkable, and
 * reachable with the back button.
 *
 * Progressive enhancement, in this order:
 *   - no JS: a real <form method="GET"> with a submit button. Works.
 *   - JS: a debounced router.replace as you type, and the submit button is
 *     hidden because it has nothing left to do.
 *
 * `replace`, not `push`: typing six characters must not put six entries in the
 * back stack.
 *
 * Deliberately NOT the ⌘K palette. That is navigate-only and role-scoped
 * (see lib/search/sections.ts); this filters one server-rendered list.
 */
export function SearchField({
  name = "q",
  action,
  placeholder = "Search…",
  label,
  defaultValue,
  debounceMs = 250,
}: {
  name?: string;
  /** The page this filters, e.g. "/patients". */
  action: string;
  placeholder?: string;
  label: string;
  defaultValue?: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function push(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    // Any filter change invalidates the page cursor — otherwise a search from
    // page 4 shows "no results" for a query that has three.
    next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${action}?${qs}` : action);
  }

  return (
    <form
      action={action}
      method="GET"
      role="search"
      className="flex items-center gap-2"
      onSubmit={(e) => {
        // With JS the URL is already current; let the debounce own it.
        e.preventDefault();
        clearTimeout(timer.current);
        push((new FormData(e.currentTarget).get(name) as string) ?? "");
      }}
    >
      {/* Every other search param must survive submission, or filtering by
          "archived" and then typing would silently clear it. */}
      {[...params.entries()]
        .filter(([k]) => k !== name && k !== "page")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}

      <label htmlFor={name} className="sr-only">
        {label}
      </label>
      <div className="relative flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={name}
          name={name}
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          className="min-h-11 pl-9 text-base md:text-base"
          onChange={(e) => {
            const value = e.currentTarget.value;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => push(value), debounceMs);
          }}
        />
      </div>

      {defaultValue ? (
        <a
          href={action}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden="true" className="size-4" />
          Clear
        </a>
      ) : null}

      {/* The no-JS path. Hidden once hydrated: with the debounce running it
          would submit a URL the router has already applied. */}
      <noscript>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Search
        </button>
      </noscript>
    </form>
  );
}
