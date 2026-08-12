"use client";

import { useState } from "react";
import { Popover } from "radix-ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { AppearancePanel } from "@/components/theme/AppearancePanel";
import { useAppearance } from "@/components/theme/AppearanceProvider";
import { cn } from "@/lib/utils";

const TRIGGER_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/**
 * Compact entry point to appearance settings. Mounted anywhere a user might be
 * — including logged-out surfaces — so a guest on the booking flow can enlarge
 * the text without an account. The canonical screen is /settings/appearance.
 */
export function AppearanceMenu({ className }: { className?: string }) {
  const { theme } = useAppearance();
  const [open, setOpen] = useState(false);
  const Icon = TRIGGER_ICON[theme];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Appearance settings"
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-md border border-input",
          "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-72 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none",
          )}
        >
          <AppearancePanel variant="compact" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
