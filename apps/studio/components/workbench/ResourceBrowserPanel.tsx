"use client";

import Link from "next/link";
import { useResourceList } from "@/hooks/use-resource-list";

// Compact, list-only resource browser for the workbench drawer
// (studio-consolidation Phase 8) — reuses the same useResourceList<T> hook
// every full CRUD page already uses, but deliberately doesn't rebuild the
// create/edit forms here; "Open full page" links out to the existing route
// for that.
type ResourceLike = { id: string; name?: string | null; description?: string | null };

function displayLabel(item: ResourceLike): string {
  if (item.name) return item.name;
  if (item.description) return item.description;
  return item.id;
}

export function ResourceBrowserPanel<T extends ResourceLike>({
  resourceClient,
  title,
  routeHref,
}: {
  resourceClient: {
    list: () => Promise<T[]>;
    create: (resource: T) => Promise<T>;
    update: (resource: T) => Promise<T>;
    delete: (id: string) => Promise<{ deleted: boolean }>;
  };
  title: string;
  routeHref: string;
}) {
  const { items, loading, error } = useResourceList(resourceClient);

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        <Link href={routeHref} className="text-muted-foreground text-xs hover:underline">
          Open full page &rarr;
        </Link>
      </div>
      {loading ? (
        <div className="flex flex-col gap-2">
          <div className="agb-skeleton h-4 w-full rounded" />
          <div className="agb-skeleton h-4 w-full rounded" />
          <div className="agb-skeleton h-4 w-2/3 rounded" />
        </div>
      ) : error ? (
        <div role="alert" className="text-destructive text-xs">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground text-xs">No {title.toLowerCase()} yet.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="truncate text-sm">
              {displayLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
