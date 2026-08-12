"use client";

import { useEffect, useState } from "react";

/**
 * 200ms per the search spec. Wired in Phase 1 even though the only provider is
 * synchronous, so Phase 8's networked providers inherit debouncing rather than
 * needing it retrofitted.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
