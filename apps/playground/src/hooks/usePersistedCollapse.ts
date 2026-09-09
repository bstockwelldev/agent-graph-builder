import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "agb-panel-sections";

function readSectionState(sectionId: string, defaultOpen: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultOpen;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    if (typeof parsed[sectionId] === "boolean") return parsed[sectionId];
  } catch {
    // Ignore corrupt storage.
  }
  return defaultOpen;
}

function writeSectionState(sectionId: string, open: boolean) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    parsed[sectionId] = open;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Storage unavailable — skip persistence.
  }
}

export function usePersistedCollapse(sectionId: string, defaultOpen = true) {
  const [open, setOpen] = useState(() => readSectionState(sectionId, defaultOpen));

  useEffect(() => {
    writeSectionState(sectionId, open);
  }, [sectionId, open]);

  const toggle = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  return { open, setOpen, toggle };
}
