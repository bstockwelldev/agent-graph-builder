"use client";

import { useId, useState } from "react";
import { FileText, History, Workflow } from "lucide-react";

import { ResourceUsageList } from "@/components/studio/resource-usage-list";
import { ResourceVersionHistory } from "@/components/studio/resource-version-history";
import type { AnyResourceKind, ResourceLike } from "@/components/studio/resource-kinds";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ResourceEditorTab = "overview" | "usage" | "history";

export function isResourceEditorTab(value: string | null | undefined): value is ResourceEditorTab {
  return value === "overview" || value === "usage" || value === "history";
}

/**
 * The one resource editor (studio-graph-workbench-redesign-plan.md, Wave 4b):
 * Overview (the kind's fields), Usage (graph nodes bound to it -- Wave 4a's
 * usages API) and History (published versions). Shared by the full resource
 * pages and the workbench panels; a new resource shows Overview only.
 */
export function ResourceEditorDialog({
  kind,
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  saving,
  onSave,
  initialTab = "overview",
}: {
  kind: AnyResourceKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ResourceLike | null;
  form: Record<string, unknown>;
  setForm: (patch: Record<string, unknown>) => void;
  saving: boolean;
  onSave: () => void;
  initialTab?: ResourceEditorTab;
}) {
  const idPrefix = `resource-${useId().replace(/:/g, "")}`;
  const canSave = kind.normalize(form) !== null;
  const fields = kind.renderFields({ form, setForm, editing, idPrefix });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${kind.noun}` : `New ${kind.noun}`}</DialogTitle>
          <DialogDescription>{kind.dialogDescription}</DialogDescription>
        </DialogHeader>
        {editing ? (
          // Keyed per resource so re-opening another resource starts on its initial tab.
          <EditorTabs key={editing.id} kind={kind} editing={editing} initialTab={initialTab} onNavigate={() => onOpenChange(false)}>
            {fields}
          </EditorTabs>
        ) : (
          <div className="space-y-3">{fields}</div>
        )}
        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="synth" disabled={!canSave || saving} onClick={onSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorTabs({
  kind,
  editing,
  initialTab,
  onNavigate,
  children,
}: {
  kind: AnyResourceKind;
  editing: ResourceLike;
  initialTab: ResourceEditorTab;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<ResourceEditorTab>(initialTab);
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as ResourceEditorTab)}>
      <TabsList className="w-full">
        <TabsTrigger value="overview">
          <FileText aria-hidden /> Overview
        </TabsTrigger>
        <TabsTrigger value="usage" disabled={!kind.client.usages}>
          <Workflow aria-hidden /> Usage
        </TabsTrigger>
        <TabsTrigger value="history" disabled={!kind.client.versions}>
          <History aria-hidden /> History
        </TabsTrigger>
      </TabsList>
      {/* keepMounted: unsaved Overview edits survive a look at Usage/History. */}
      <TabsContent value="overview" keepMounted className="space-y-3 pt-1">
        {children}
      </TabsContent>
      <TabsContent value="usage" className="pt-1">
        {kind.client.usages ? (
          <ResourceUsageList resourceId={editing.id} loadUsages={kind.client.usages} onNavigate={onNavigate} />
        ) : null}
      </TabsContent>
      <TabsContent value="history" className="pt-1">
        {kind.client.versions ? (
          <ResourceVersionHistory resourceId={editing.id} versionsClient={kind.client.versions} />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
