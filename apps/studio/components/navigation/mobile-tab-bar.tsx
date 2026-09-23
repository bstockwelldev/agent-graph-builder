"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MobileTab = {
  id: string;
  label: string;
  icon: ReactNode;
  /** A destination: renders a link, `aria-current="page"` when `active`. */
  href?: string;
  /** An action (open a panel, a menu): renders a button. */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Destination tabs: the current route. Action tabs: the panel it opens is open. */
  active?: boolean;
  /** Action tabs that open a menu. */
  hasPopup?: "menu" | "dialog";
};

/** Height of the bar above the safe-area inset -- pad content by this. */
export const MOBILE_TAB_BAR_HEIGHT = 64;

/**
 * Mobile bottom tab bar (roadmap P3 "Mobile bottom nav tray", STO-607):
 * the standard app pattern -- up to five icon-over-label tabs, 44px+ touch
 * targets, a pill behind the active icon, safe-area aware. One component
 * for both uses: global destinations on regular pages (StudioShell) and
 * canvas actions on the graph route (GraphEditor). Plain Tailwind + lucide
 * (no shadcn primitives), so the token-styled graph route can use it too.
 */
export function MobileTabBar({
  tabs,
  "aria-label": ariaLabel,
  className,
}: {
  tabs: MobileTab[];
  "aria-label": string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "bg-surface-container-low/95 border-outline-variant/20 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1" style={{ height: MOBILE_TAB_BAR_HEIGHT }}>
        {tabs.map((tab) => (
          <li key={tab.id} className="flex min-w-0 flex-1">
            <TabItem tab={tab} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

const itemClass = (active: boolean) =>
  cn(
    "group flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] leading-4 font-medium outline-none",
    "focus-visible:ring-2 focus-visible:ring-[#8fbaff] focus-visible:ring-offset-0",
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
  );

function TabBody({ tab }: { tab: MobileTab }) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-full transition-colors [&_svg]:size-5",
          tab.active ? "bg-primary/20 text-primary" : "group-hover:bg-accent/60",
        )}
      >
        {tab.icon}
      </span>
      <span className="max-w-full truncate">{tab.label}</span>
    </>
  );
}

function TabItem({ tab }: { tab: MobileTab }) {
  if (tab.href) {
    return (
      <Link href={tab.href} aria-current={tab.active ? "page" : undefined} className={itemClass(Boolean(tab.active))}>
        <TabBody tab={tab} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={tab.onClick}
      aria-pressed={tab.hasPopup ? undefined : Boolean(tab.active)}
      aria-haspopup={tab.hasPopup}
      aria-expanded={tab.hasPopup ? Boolean(tab.active) : undefined}
      className={itemClass(Boolean(tab.active))}
    >
      <TabBody tab={tab} />
    </button>
  );
}
