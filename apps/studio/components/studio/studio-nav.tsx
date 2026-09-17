"use client";

import Link from "next/link";
import {
  BarChart3,
  Bot,
  FileText,
  Layers,
  ListTree,
  Server,
  SlidersHorizontal,
  Workflow,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";

// Nav groups locked in docs/planning/features/studio-consolidation-plan.md's
// Phase 4c: Build = Graphs/Agents/Prompts/Tools/MCP/LLM Profiles/GenUI,
// Operate = Runs/Analytics. No Dashboard (root "/" redirects straight to
// "/graphs"); Deployments/History/Evaluations dropped — MUI's versions were
// placeholder screens or superseded by AGB's real run history.
const studioNavGroups = [
  {
    label: "Build",
    items: [
      { href: "/graphs", label: "Graphs", icon: Workflow },
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/prompts", label: "Prompts", icon: FileText },
      { href: "/tools", label: "Tools", icon: Wrench },
      { href: "/mcp", label: "MCP", icon: Server },
      { href: "/llm-profiles", label: "LLM Profiles", icon: SlidersHorizontal },
      { href: "/genui", label: "GenUI", icon: Layers },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/runs", label: "Runs", icon: ListTree },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
] as const;

function isStudioNavItemActive(pathname: string, href: string) {
  if (href === "/graphs") {
    return pathname === "/graphs" || pathname.startsWith("/graphs/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div>
        <Link
          href="/graphs"
          className="text-sidebar-foreground text-lg font-semibold tracking-tight transition-expressive hover:text-sidebar-primary"
          onClick={onNavigate}
        >
          Agent Graph Studio
        </Link>
        <p className="text-muted-foreground mt-1 text-xs leading-snug">
          Graph studio · LangGraph runtime
        </p>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        {studioNavGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-muted-foreground px-2 text-[10px] font-semibold tracking-wider uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isStudioNavItemActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        "transition-expressive flex items-center gap-2 rounded-md px-2 py-2 text-sm",
                        active
                          ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                      )}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                    >
                      <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
