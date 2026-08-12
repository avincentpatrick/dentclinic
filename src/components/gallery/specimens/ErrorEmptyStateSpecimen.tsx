"use client";

import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

/**
 * The error register needs an onClick retry, and event handlers cannot be
 * passed from a Server Component — the registry is server-rendered. Interactive
 * specimens therefore live in their own client module.
 */
export function ErrorEmptyStateSpecimen() {
  return (
    <EmptyState
      register="error"
      icon={WifiOff}
      title="Couldn't load appointments"
      description="Check your connection and try again."
      action={{ label: "Try again", onClick: () => window.location.reload() }}
    />
  );
}
