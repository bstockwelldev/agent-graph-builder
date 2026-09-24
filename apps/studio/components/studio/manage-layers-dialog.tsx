"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GraphLayer } from "@bstockwelldev/agent-graph-sdk";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GROUP_COLORS, type GroupColorId } from "@/lib/graphGroups";
import { DEFAULT_LAYERS } from "@/lib/graphLayers";

export type LayerEdit = {
  layers: GraphLayer[];
  /** "none" keeps assignments; otherwise auto-assign unassigned or all nodes. */
  autoAssign: "none" | "unassigned" | "all";
};

// Large-graph complexity, Wave 7d (STO-622): edit the graph's architecture
// layers. The draft is local until Apply, which the caller commits as one
// undoable change (nodes on a deleted layer become Unassigned).
export function ManageLayersDialog({
  open,
  onOpenChange,
  layers,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layers: GraphLayer[];
  onApply: (edit: LayerEdit) => void;
}) {
  const [draft, setDraft] = useState<GraphLayer[]>(layers);
  const [autoAssign, setAutoAssign] = useState<LayerEdit["autoAssign"]>("none");

  useEffect(() => {
    if (!open) return;
    setDraft(layers);
    setAutoAssign("none");
  }, [open, layers]);

  const update = (index: number, patch: Partial<GraphLayer>) =>
    setDraft((current) => current.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)));
  const addLayer = () => {
    let n = draft.length + 1;
    while (draft.some((layer) => layer.id === `layer_${n}`)) n += 1;
    setDraft((current) => [...current, { id: `layer_${n}`, label: `Layer ${n}`, color: "slate" }]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage layers</DialogTitle>
          <DialogDescription>
            Architecture layers group nodes into swimlanes in the Layers view. They&apos;re display-only and never change
            how the graph runs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2" role="list" aria-label="Layers">
          {draft.length === 0 && <p className="text-muted-foreground text-sm">No layers yet.</p>}
          {draft.map((layer, index) => (
            <div key={layer.id} role="listitem" className="flex items-center gap-2">
              <Input aria-label={`Layer ${index + 1} name`} value={layer.label} onChange={(e) => update(index, { label: e.target.value })} />
              <div className="flex gap-1" role="radiogroup" aria-label={`${layer.label} colour`}>
                {(Object.keys(GROUP_COLORS) as GroupColorId[]).map((colorId) => (
                  <button
                    key={colorId}
                    type="button"
                    role="radio"
                    aria-checked={(layer.color ?? "slate") === colorId}
                    aria-label={colorId}
                    title={colorId}
                    onClick={() => update(index, { color: colorId })}
                    className="h-5 w-5 rounded-full border-2"
                    style={{ background: GROUP_COLORS[colorId], borderColor: (layer.color ?? "slate") === colorId ? "white" : "transparent" }}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${layer.label}`}
                onClick={() => setDraft((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={addLayer}>
              <Plus className="h-4 w-4" /> Add layer
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(DEFAULT_LAYERS)}>
              Use default layers
            </Button>
          </div>
        </div>
        <fieldset className="space-y-1 text-sm">
          <legend className="font-medium">Auto-assign by node type</legend>
          {(
            [
              ["none", "Keep current assignments"],
              ["unassigned", "Assign unassigned nodes"],
              ["all", "Reassign every node"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="auto-assign" checked={autoAssign === value} onChange={() => setAutoAssign(value)} />
              {label}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={draft.some((layer) => !layer.label.trim())}
            onClick={() => {
              onApply({ layers: draft.map((layer) => ({ ...layer, label: layer.label.trim() })), autoAssign });
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
