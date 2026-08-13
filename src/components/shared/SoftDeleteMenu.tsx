"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Archive / Restore for one row. Never "Delete" — there is no DELETE grant on
 * any table and the word does not appear in this app. See
 * docs/design-system/05-patterns/soft-delete.md.
 *
 * The confirmation NAMES the record ("Archive Maria Santos?"), because "Are you
 * sure?" does not tell you what you are about to do — and on a roster of
 * similar names that is exactly the mistake being guarded against.
 *
 * Restore needs no confirmation. It is not destructive, and adding friction to
 * the undo path is how a reversible mistake becomes an irreversible one.
 *
 * KNOWN LIMIT: a Radix dropdown cannot open without JavaScript, so this control
 * is JS-only. That is acceptable because it is not the only path — the roster's
 * Archived filter is a plain link, and restoring from there is a plain form. No
 * data is reachable ONLY through this menu.
 */
export function SoftDeleteMenu({
  label,
  archived,
  archiveAction,
  restoreAction,
}: {
  /** The record's name, used verbatim in the confirmation. */
  label: string;
  archived: boolean;
  /** Server actions, pre-bound to the row id by the caller. */
  archiveAction: () => Promise<void>;
  restoreAction: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-11 p-0" aria-label={`Actions for ${label}`}>
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {archived ? (
            <DropdownMenuItem asChild>
              {/* A form, not an onClick: the action runs as a POST and the row
                  re-renders from the server. */}
              <form action={restoreAction}>
                <button type="submit" className="flex w-full items-center gap-2">
                  <ArchiveRestore aria-hidden="true" className="size-4" />
                  Restore
                </button>
              </form>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirming(true)}>
              <Archive aria-hidden="true" className="size-4" />
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              They stay in the system and nothing is deleted — the record moves out of the
              active list and can be restored at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <form action={archiveAction}>
              <AlertDialogAction type="submit" className="min-h-11">
                Archive
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
