"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FixtureDataset, RunSummary } from "@bstockwelldev/agent-graph-sdk";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { client } from "@/lib/api-client";
import { defaultCaptureName, runsBlockingFrozenCapture } from "@/lib/datasets";
import { errorDetail } from "@/lib/knowledgePanel";

// "Historical runs should become engineering datasets"
// (docs/planning/features/graph-native-control-plane-plan.md): captures the
// runs selected in the run-history grid into a saved fixture dataset the
// Routing Lab can load. Freezing each run's recorded node outputs (default)
// makes routers see the real upstream classifications instead of the stub
// provider's; unchecking captures inputs only.
export function CaptureDatasetDialog({
  open,
  onOpenChange,
  graphId,
  runs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graphId: string;
  runs: RunSummary[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [freeze, setFreeze] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<FixtureDataset | null>(null);

  // A fresh capture each time the dialog opens; `runs` is intentionally not a
  // dependency so ticking another row while it's open doesn't wipe the form.
  useEffect(() => {
    if (!open) return;
    setName(defaultCaptureName(graphId, runs.length));
    setDescription("");
    setFreeze(true);
    setSaving(false);
    setError(null);
    setSaved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, graphId]);

  const blocking = freeze ? runsBlockingFrozenCapture(runs) : [];
  const canSave = name.trim() !== "" && runs.length > 0 && blocking.length === 0 && !saving;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const dataset = await client.datasets.fromRuns({
        name: name.trim(),
        description: description.trim() || undefined,
        runIds: runs.map((run) => run.run_id),
        includeNodeOutputs: freeze,
      });
      setSaved(dataset);
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
          <DialogTitle>Save runs as dataset</DialogTitle>
          <DialogDescription>
            {runs.length} selected run{runs.length === 1 ? "" : "s"} become fixtures you can replay in the
            Routing Lab.
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="space-y-3 text-sm" role="status">
            <p>
              Saved <span className="font-medium">{saved.name}</span> with {saved.fixtures.length} fixture
              {saved.fixtures.length === 1 ? "" : "s"}.
            </p>
            <p className="text-muted-foreground text-xs">
              Open the graph, then Routing lab → Saved datasets → Load.
            </p>
            <DialogFooter>
              <Link href={`/graphs/${graphId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open graph
              </Link>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="capture-dataset-name">Name</Label>
              <Input id="capture-dataset-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capture-dataset-description">Description (optional)</Label>
              <Input
                id="capture-dataset-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-2">
              <input
                id="capture-dataset-freeze"
                type="checkbox"
                className="mt-0.5"
                checked={freeze}
                onChange={(e) => setFreeze(e.target.checked)}
              />
              <Label htmlFor="capture-dataset-freeze" className="flex-col items-start gap-0.5">
                <span>Freeze recorded node outputs</span>
                <span className="text-muted-foreground text-xs font-normal">
                  Routers then see each run&apos;s real upstream results. Only succeeded runs qualify; uncheck to
                  capture inputs only.
                </span>
              </Label>
            </div>
            {blocking.length > 0 ? (
              <p role="alert" className="text-destructive text-sm">
                {blocking.length} selected run{blocking.length === 1 ? "" : "s"} didn&apos;t succeed
                ({[...new Set(blocking.map((run) => run.status))].join(", ")}). Deselect
                {blocking.length === 1 ? " it" : " them"}, or uncheck freezing to capture inputs only.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canSave} onClick={() => void handleSave()}>
                {saving ? "Saving…" : "Save dataset"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
