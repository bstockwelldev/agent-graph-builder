import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import type { Fixture, FixtureDataset } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { buildDatasetForSave, describeDataset } from "@/lib/datasets";
import { color, shell, spacing, typeScale } from "@/lib/graph-theme";
import { errorDetail } from "@/lib/knowledgePanel";
import { Button } from "./ui/Button";
import { Select, TextInput } from "./ui/fields";

// Saved-dataset controls for the Routing Lab (RoutingLabPanel.tsx): load a
// named fixture dataset into the editor, save the editor's current fixtures
// as a new dataset, update the loaded one in place, or delete. Before this,
// a dataset lived only in the panel's textarea state and vanished when the
// panel closed. Datasets are global, not per-graph — any graph can run any
// dataset (backend/app/resource_models.py's FixtureDataset).

function byNewestUpdate(a: FixtureDataset, b: FixtureDataset): number {
  return b.updated_at.localeCompare(a.updated_at);
}

export function DatasetPicker({
  getFixtures,
  onLoad,
  disabled = false,
}: {
  /** The editor's current fixtures; throws a user-readable Error when the text is invalid. */
  getFixtures: () => Fixture[];
  onLoad: (fixtures: Fixture[]) => void;
  disabled?: boolean;
}) {
  const [datasets, setDatasets] = useState<FixtureDataset[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loaded, setLoaded] = useState<FixtureDataset | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.datasets
      .list()
      .then((list) => {
        if (!cancelled) setDatasets([...list].sort(byNewestUpdate));
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(errorDetail(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = datasets.find((dataset) => dataset.id === selectedId) ?? null;

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setConfirmingDelete(false);
    setError(null);
  }, []);

  const handleLoad = useCallback(() => {
    if (!selected) return;
    onLoad(selected.fixtures);
    setLoaded(selected);
    setName(selected.name);
    setError(null);
  }, [onLoad, selected]);

  // Runs `write` with the editor's fixtures; parse problems and request
  // failures both land in the same error slot.
  const save = useCallback(
    async (existing: FixtureDataset | null) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Give the dataset a name first.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const next = buildDatasetForSave({ name: trimmed, fixtures: getFixtures(), existing });
        const saved = existing ? await client.datasets.update(next) : await client.datasets.create(next);
        setDatasets((current) => [saved, ...current.filter((dataset) => dataset.id !== saved.id)].sort(byNewestUpdate));
        setLoaded(saved);
        setSelectedId(saved.id);
      } catch (err) {
        setError(errorDetail(err));
      } finally {
        setBusy(false);
      }
    },
    [getFixtures, name],
  );

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await client.datasets.delete(selected.id);
      setDatasets((current) => current.filter((dataset) => dataset.id !== selected.id));
      if (loaded?.id === selected.id) setLoaded(null);
      setSelectedId("");
      setConfirmingDelete(false);
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setBusy(false);
    }
  }, [loaded, selected]);

  const locked = disabled || busy;

  return (
    <div style={{ marginBottom: spacing[3] }}>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Saved datasets</div>
      <div style={{ display: "flex", gap: spacing[2] }}>
        <Select
          aria-label="Saved dataset"
          value={selectedId}
          disabled={locked}
          onChange={(e) => handleSelect(e.target.value)}
        >
          <option value="">{datasets.length === 0 ? "No saved datasets yet" : "Choose a dataset…"}</option>
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {describeDataset(dataset)}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          disabled={!selected || locked}
          onClick={handleLoad}
          style={{ minHeight: shell.touchTarget.min, whiteSpace: "nowrap" }}
        >
          Load
        </Button>
      </div>
      {listError && (
        <div role="alert" style={errorStyle}>
          Couldn&apos;t load saved datasets: {listError}
        </div>
      )}

      <div style={{ ...typeScale.caption, opacity: 0.6, margin: `${spacing[2]}px 0 ${spacing[1]}px` }}>
        Save the fixtures below as
      </div>
      <TextInput
        aria-label="Dataset name"
        value={name}
        placeholder="dataset name"
        disabled={locked}
        onChange={(e) => setName(e.target.value)}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: spacing[2], marginTop: spacing[2] }}>
        <Button variant="secondary" disabled={locked} onClick={() => void save(null)}>
          Save as new
        </Button>
        {loaded && (
          <Button variant="secondary" disabled={locked} onClick={() => void save(loaded)}>
            Update “{loaded.name}”
          </Button>
        )}
        {selected &&
          (confirmingDelete ? (
            <>
              <Button variant="destructive" disabled={locked} onClick={() => void handleDelete()}>
                Confirm delete
              </Button>
              <Button variant="ghost" disabled={locked} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" disabled={locked} onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          ))}
      </div>
      {error && (
        <div role="alert" style={errorStyle}>
          {error}
        </div>
      )}
    </div>
  );
}

const errorStyle: CSSProperties = {
  ...typeScale.caption,
  color: color.warning[500],
  marginTop: spacing[2],
  lineHeight: "16px",
};
