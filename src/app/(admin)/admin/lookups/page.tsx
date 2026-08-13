import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, DoorOpen, Tag } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCategories, getLookupCounts } from "@/lib/lookups/read";
import { keyToSlug } from "@/lib/lookups/query";

export const metadata: Metadata = { title: "Lookups" };

/**
 * The lookups hub.
 *
 * A hub with child routes rather than one page of sections, for four mechanical
 * reasons rather than taste:
 *
 *  1. `SearchField` re-emits every OTHER search param as a hidden input, so two
 *     lists on one page means typing in one box carries the other's cursor.
 *  2. `SearchField` takes a single `action` path.
 *  3. `DataTable`'s pagination patches only `page`, so two paginators fight.
 *  4. `[category]` is dynamic, so a category seeded in a future migration gets
 *     an admin screen with no route work at all.
 *
 * No ROUTE_RULES change: `{ prefix: "/admin", roles: ["superadmin"] }` covers
 * every path here, and `npm run check:routes` proves it.
 */
export default async function LookupsHub() {
  const [categories, counts] = await Promise.all([getCategories(), getLookupCounts()]);

  const cards = [
    {
      href: "/admin/lookups/appointment-types",
      icon: CalendarClock,
      title: "Appointment types",
      description:
        "What can be booked, how long it takes, and the buffers around it. The scheduling engine reads these.",
      count: counts.appointmentTypes,
      one: "type",
      many: "types",
    },
    {
      href: "/admin/lookups/operatories",
      icon: DoorOpen,
      title: "Treatment rooms",
      description: "The chairs appointments are booked into, and which of them are for hygiene.",
      count: counts.operatories,
      one: "room",
      many: "rooms",
    },
    ...categories.map((c) => ({
      href: `/admin/lookups/${keyToSlug(c.key)}`,
      icon: Tag,
      title: c.label,
      description: c.description ?? "",
      count: counts.byCategoryId[c.id] ?? 0,
      // Both forms spelled out. Appending "s" produced "8 entrys" on the
      // deployed page — caught by the live acceptance run, not by review.
      one: "entry",
      many: "entries",
    })),
  ];

  return (
    <>
      <PageHeader
        title="Lookups"
        description="The lists this clinic chooses from — everywhere in the app."
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <li key={card.href}>
              <Link
                href={card.href}
                className="flex min-h-11 gap-3 rounded-xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-medium text-foreground">{card.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {card.description}
                  </span>
                  <span className="mt-2 block text-xs font-medium text-foreground">
                    {/* Spelled out rather than a bare number: "0" beside a card
                        title reads as an error, "No entries yet" does not. */}
                    {card.count === 0
                      ? `No ${card.many} yet`
                      : `${card.count} ${card.count === 1 ? card.one : card.many}`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
