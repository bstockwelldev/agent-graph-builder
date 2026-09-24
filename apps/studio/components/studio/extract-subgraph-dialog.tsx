"use client";

import { useEffect, useState } from "react";

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
import { Label } from "@/components/ui/label";
import { errorDetail } from "@/lib/knowledgePanel";

// Large-graph complexity, Wave 7c (STO-612): "Extract to graph" -- names
// the new graph a selection (or a 7b group) moves into. The caller does the
// extract and applies the rewired parent; this only collects the name and
// surfaces the backend's reason when the selection can't be extracted.
export function ExtractSubgraphDialog({
  open,
  onOpenChange,
  nodeCount,
  defaultName,
  onExtract,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeCount: number;
  defaultName: string;
  onExtract: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setSaving(false);
    setError(null);
  }, [open, defaultName]);

  async function handleExtract() {
    setSaving(true);
    setError(null);
    try {
      await onExtract(name.trim());
      onOpenChange(false);
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extract to graph</DialogTitle>
          <DialogDescription>
            {nodeCount} node{nodeCount === 1 ? "" : "s"} move into a new saved graph, replaced here by one subgraph
            node that runs it. Undo puts them back.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !saving) void handleExtract();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="extract-subgraph-name">New graph name</Label>
            <Input id="extract-subgraph-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || saving}>
              {saving ? "Extracting…" : "Extract"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
