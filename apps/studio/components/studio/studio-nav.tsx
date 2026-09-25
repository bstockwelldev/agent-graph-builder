"use client";

import Link from "next/link";
import {
  BarChart3,
  Bot,
  Boxes,
  FileText,
  Layers,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Shuffle,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; description?: string };

/**
 * Resource registries (studio-graph-workbench-redesign-plan.md, Wave 2 /
 * STO-603; review section 7: "Do not expose every resource type as a
 * primary navigation destination"). They used to be six of the nine
 * permanent sidebar items; they're now one "Resources" rail entry, with
 * this list driving the /resources hub and the tab strip shown on each
 * resource page.
 */
export const RESOURCE_ITEMS: readonly NavItem[] = [
  { href: "/agents", label: "Agents", icon: Bot, description: "Reusable agent profiles: model, prompt, and tools together." },
  { href: "/prompts", label: "Prompts", icon: FileText, description: "Versioned prompt templates with variables." },
  { href: "/tools", label: "Tools", icon: Wrench, description: "Tool definitions agents and tool nodes can call." },
  { href: "/mcp", label: "MCP", icon: Server, description: "Model Context Protocol servers that expose tools." },
  { href: "/llm-profiles", label: "LLM Profiles", icon: SlidersHorizontal, description: "Named provider/model/parameter presets." },
  { href: "/transforms", label: "Transforms", icon: Shuffle, description: "Reusable data reshaping between steps: select, wrap, format, convert." },
  { href: "/genui", label: "GenUI", icon: Layers, description: "Schema-driven UI surfaces for human-gate checkpoints." },
];

const RESOURCE_PREFIXES = ["/resources", ...RESOURCE_ITEMS.map((item) => item.href)];

/**
 * The compact rail's destinations (review section 7: Graph · Resources ·
 * Analytics, plus Policies since STO-608). `mobileTab: false` keeps an item
 * out of the phone tab bar, which only has room for five tabs; it's still
 * in the More sheet.
 */
export const STUDIO_RAIL_ITEMS: readonly (NavItem & { matches: readonly string[]; mobileTab?: boolean })[] = [
  { href: "/graphs", label: "Graphs", icon: Workflow, matches: ["/graphs"] },
  { href: "/resources", label: "Resources", icon: Boxes, matches: RESOURCE_PREFIXES },
  { href: "/analytics", label: "Analytics", icon: BarChart3, matches: ["/analytics"] },
  { href: "/policies", label: "Policies", icon: ShieldCheck, matches: ["/policies"], mobileTab: false },
];

// Still consumed by the command palette's "jump to a page" groups. Runs is
// gone: run history lives in each graph's Run panel now, and /runs
// redirects (Wave 2).
export const studioNavGroups = [
  { label: "Agent Graphs", items: [{ href: "/graphs", label: "Graphs", icon: Workflow }] },
  { label: "Resources", items: [{ href: "/resources", label: "All resources", icon: Boxes }, ...RESOURCE_ITEMS] },
  { label: "Observability & Analytics", items: [{ href: "/analytics", label: "Analytics", icon: BarChart3 }] },
  { label: "Governance", items: [{ href: "/policies", label: "Policies", icon: ShieldCheck }] },
] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isRailItemActive(pathname: string, matches: readonly string[]) {
  return matches.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isResourceRoute(pathname: string) {
  return RESOURCE_ITEMS.some((item) => matchesPrefix(pathname, item.href));
}

/**
 * Desktop icon rail (Wave 2): 72px, icon over a short label, replacing the
 * 240px text sidebar so non-canvas pages give the width back to content.
 */
export function StudioRail({ pathname, footer }: { pathname: string; footer?: React.ReactNode }) {
  return (
    <>
      <Link
        href="/graphs"
        aria-label="Agent Graph Studio home"
        title="Agent Graph Studio"
        className="bg-sidebar-primary/15 text-sidebar-primary transition-expressive hover:bg-sidebar-primary/25 flex size-10 items-center justify-center rounded-xl text-sm font-bold"
      >
        AG
      </Link>
      <nav aria-label="Studio" className="flex flex-1 flex-col items-center gap-1">
        {STUDIO_RAIL_ITEMS.map(({ href, label, icon: Icon, matches }) => {
          const active = isRailItemActive(pathname, matches);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "transition-expressive flex w-14 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      {footer}
    </>
  );
}

/** Full-label nav for the mobile sheet: the rail's destinations, with the resource types listed under Resources. */
export function StudioNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const linkClass = (active: boolean) =>
    cn(
      "transition-expressive flex items-center gap-2 rounded-md px-2 py-2 text-sm",
      active
        ? "bg-sidebar-accent text-sidebar-foreground font-medium"
        : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    );
  return (
    <>
      <div>
        <Link
          href="/graphs"
          className="text-sidebar-foreground transition-expressive hover:text-sidebar-primary text-lg font-semibold tracking-tight"
          onClick={onNavigate}
        >
          Agent Graph Studio
        </Link>
        <p className="text-muted-foreground mt-1 text-xs leading-snug">Graph studio · LangGraph runtime</p>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Studio">
        {STUDIO_RAIL_ITEMS.map(({ href, label, icon: Icon, matches }) => {
          const active = isRailItemActive(pathname, matches);
          return (
            <div key={href}>
              <Link href={href} className={linkClass(active && !(href === "/resources" && isResourceRoute(pathname)))} aria-current={active ? "page" : undefined} onClick={onNavigate}>
                <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                {label}
              </Link>
              {href === "/resources" && (
                <ul className="border-sidebar-border ml-4 border-l pl-2">
                  {RESOURCE_ITEMS.map((item) => {
                    const itemActive = matchesPrefix(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link href={item.href} className={linkClass(itemActive)} aria-current={itemActive ? "page" : undefined} onClick={onNavigate}>
                          <item.icon className="size-4 shrink-0 opacity-80" aria-hidden />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}

/** Tab strip across the top of every resource page, so switching resource types is one click from any of them. */
export function ResourceTabs({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Resource types" className="mb-4 flex gap-1 overflow-x-auto border-b">
      {RESOURCE_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = matchesPrefix(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "transition-expressive -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              active
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
