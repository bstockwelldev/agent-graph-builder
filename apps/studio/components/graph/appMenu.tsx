import { BarChart3, Boxes, FolderOpen, LogIn, LogOut, ShieldCheck, Shapes } from "lucide-react";

import type { NodeContextMenuAction } from "@/components/graph/NodeContextMenu";
import { RESOURCE_KINDS } from "@/components/studio/resource-kinds";
import type { StudioAccount } from "@/hooks/use-studio-account";
import type { WorkbenchPanelId } from "@/components/workbench/panels";

/**
 * The "App" group of the graph header's `⋯` menu and the mobile tray's More
 * menu (canvas-first-landing-plan.md §5). With the rail gone these are the way
 * to everything that used to be a page: the graph picker, the resource
 * registries, Analytics, workspace policies, the GenUI catalog, and the
 * account. Each opens its workbench panel; none leaves the canvas.
 */
export function buildAppMenuActions({
  openGraphPicker,
  openPanel,
  account,
  goTo,
}: {
  openGraphPicker?: () => void;
  openPanel: (panel: WorkbenchPanelId) => void;
  account: StudioAccount;
  goTo: (href: string) => void;
}): NodeContextMenuAction[] {
  const actions: NodeContextMenuAction[] = [];
  if (openGraphPicker) {
    actions.push({
      label: "Open graph…",
      icon: <FolderOpen size={14} />,
      shortcut: "⌘O",
      separatorBefore: true,
      groupLabel: "App",
      onClick: openGraphPicker,
    });
  }
  actions.push(
    {
      label: "Resources",
      icon: <Boxes size={14} />,
      separatorBefore: !openGraphPicker,
      groupLabel: openGraphPicker ? undefined : "App",
      onClick: () => undefined,
      submenu: RESOURCE_KINDS.map((kind) => ({ label: kind.panelTitle, onClick: () => openPanel(kind.panelId) })),
    },
    { label: "Analytics", icon: <BarChart3 size={14} />, onClick: () => openPanel("analytics") },
    { label: "Workspace policies", icon: <ShieldCheck size={14} />, onClick: () => openPanel("workspacePolicies") },
    { label: "GenUI catalog", icon: <Shapes size={14} />, onClick: () => openPanel("genui") },
  );
  // No account section when Supabase auth isn't configured, or while it loads.
  if (account.configured && account.user) {
    actions.push(
      { label: account.label, disabled: true, separatorBefore: true, onClick: () => undefined },
      { label: "Sign out", icon: <LogOut size={14} />, onClick: account.signOut },
    );
  } else if (account.configured && account.user === null) {
    actions.push({ label: "Sign in", icon: <LogIn size={14} />, separatorBefore: true, onClick: () => goTo(account.signInHref) });
  }
  return actions;
}
