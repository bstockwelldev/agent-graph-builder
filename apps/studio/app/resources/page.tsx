"use client";

import Link from "next/link";

import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { RESOURCE_ITEMS } from "@/components/studio/studio-nav";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { studioResourceCardInteractiveClass } from "@/components/studio/studio-resource-card-actions";
import { cn } from "@/lib/utils";

// Resources hub (studio-graph-workbench-redesign-plan.md, Wave 2 /
// STO-603): the single "Resources" rail entry lands here instead of six
// separate sidebar items. Cards for discovery (review section 61:
// "Discovery -> cards"); each registry page keeps its own management view.
export default function ResourcesPage() {
  return (
    <StudioPage>
      <StudioPageHeader
        title="Resources"
        description="Reusable building blocks your graphs reference — agents, prompts, tools, MCP servers, model profiles, and GenUI surfaces."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCE_ITEMS.map(({ href, label, icon: Icon, description }) => (
          <Card key={href} className={cn("p-0", studioResourceCardInteractiveClass)}>
            <Link href={href} className="block p-5">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="text-primary size-5" aria-hidden />
                  {label}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Link>
          </Card>
        ))}
      </div>
    </StudioPage>
  );
}
