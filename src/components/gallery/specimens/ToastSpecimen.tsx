"use client";

import { toast } from "sonner";
import { Toaster } from "@/components/shared/Toaster";
import { Button } from "@/components/ui/button";

/**
 * Fixtures only — no Supabase, no server actions (eslint enforces it on this
 * directory, because /design-system is the one route with an audit bypass).
 * The Undo here is a no-op; the live instance is the /patients roster.
 *
 * The gallery renders outside AppShell, so this specimen mounts its own
 * Toaster. The `?matrix=all` view renders this component many times over, and
 * multiple sonner Toasters share one global queue — that is why the buttons are
 * the specimen rather than a permanently-visible toast.
 */
export function ToastSpecimen() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toaster />
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() =>
          toast("Patient archived", {
            id: "specimen-archive",
            description: "The record is out of the active list. Nothing was deleted.",
            action: { label: "Undo", onClick: () => toast.dismiss("specimen-archive") },
          })
        }
      >
        Archive toast, with Undo
      </Button>
      <Button
        variant="ghost"
        className="min-h-11"
        onClick={() => toast("Changes saved", { id: "specimen-plain" })}
      >
        Plain toast
      </Button>
    </div>
  );
}
