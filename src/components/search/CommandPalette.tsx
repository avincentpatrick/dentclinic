"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { providers } from "@/lib/search/providers";
import { SECTION_LABELS, SECTION_ORDER, type SearchResult } from "@/lib/search/sections";
import { useDebouncedValue } from "@/lib/search/use-debounced-value";
import type { AppRole } from "@/lib/roles";

/**
 * Phase 1 scope: Navigate only. Sections render in SECTION_ORDER and empty ones
 * are skipped, so Phase 8 adds providers without touching this file.
 *
 * Mobile gets the same dialog full-screen rather than a separate SearchSheet —
 * that component belongs with Phase 8's recents/contextual-patient work.
 */
export function CommandPalette({
  role,
  open,
  onOpenChange,
}: {
  role: AppRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 200);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const active = providers.filter((p) => p.enabledFor(role));

    Promise.all(
      active.map((p) => p.query(debounced, { role }, controller.signal).catch(() => [] as SearchResult[])),
    ).then((sets) => {
      if (!controller.signal.aborted) setResults(sets.flat());
    });

    return () => controller.abort();
  }, [debounced, role]);

  // Reset on close in the handler rather than an effect — the close IS the
  // event, so there is nothing to synchronise after the fact.
  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  function runResult(result: SearchResult) {
    handleOpenChange(false);
    if (result.href) router.push(result.href);
    else result.run?.();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Search"
      description="Search and navigate DentClinic"
      className="top-0 max-w-none translate-y-0 rounded-none sm:top-[10%] sm:max-w-lg sm:translate-y-0 sm:rounded-xl"
    >
      <CommandInput placeholder="Search or jump to…" value={query} onValueChange={setQuery} />
      <CommandList className="overscroll-contain">
        <CommandEmpty>No results found.</CommandEmpty>
        {SECTION_ORDER.map((section) => {
          const items = results.filter((r) => r.section === section);
          if (items.length === 0) return null;
          return (
            <CommandGroup key={section} heading={SECTION_LABELS[section]}>
              {items.map((result) => {
                const Icon = result.icon;
                return (
                  <CommandItem
                    key={result.id}
                    value={`${result.label} ${result.keywords?.join(" ") ?? ""}`}
                    onSelect={() => runResult(result)}
                    className="min-h-11"
                  >
                    {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
                    <span>{result.label}</span>
                    {result.sublabel && (
                      <span className="ml-auto text-xs text-muted-foreground">{result.sublabel}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
