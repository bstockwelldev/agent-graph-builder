import { useCallback, useEffect, useState } from "react";

import { nextExclusiveOpenId } from "../lib/observePanel";

export const PANEL_SECTIONS_STORAGE_KEY = "agb-panel-sections";

function readStore(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(PANEL_SECTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore corrupt storage.
  }
  return {};
}

function writeStore(parsed: Record<string, unknown>) {
  try {
    window.localStorage.setItem(PANEL_SECTIONS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Storage unavailable — skip persistence.
  }
}

function readSectionState(sectionId: string, defaultOpen: boolean): boolean {
  const parsed = readStore();
  if (typeof parsed[sectionId] === "boolean") {
    return parsed[sectionId];
  }
  return defaultOpen;
}

function writeSectionState(sectionId: string, open: boolean) {
  const parsed = readStore();
  parsed[sectionId] = open;
  writeStore(parsed);
}

export function readExclusiveOpenId(groupKey: string, defaultOpenId: string | null): string | null {
  const parsed = readStore();
  const stored = parsed[groupKey];
  if (stored === null) {
    return null;
  }
  if (typeof stored === "string") {
    return stored;
  }
  return defaultOpenId;
}

export function writeExclusiveOpenId(groupKey: string, openId: string | null) {
  const parsed = readStore();
  parsed[groupKey] = openId;
  writeStore(parsed);
}

export function usePersistedCollapse(sectionId: string, defaultOpen = true, enabled = true) {
  const [open, setOpen] = useState(() => (enabled ? readSectionState(sectionId, defaultOpen) : defaultOpen));

  useEffect(() => {
    if (!enabled) return;
    writeSectionState(sectionId, open);
  }, [enabled, sectionId, open]);

  const toggle = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  return { open, setOpen, toggle };
}

export function useExclusiveCollapse(groupKey: string, defaultOpenId: string | null = null) {
  const [openId, setOpenId] = useState(() => readExclusiveOpenId(groupKey, defaultOpenId));

  useEffect(() => {
    writeExclusiveOpenId(groupKey, openId);
  }, [groupKey, openId]);

  const openSection = useCallback((id: string | null) => {
    setOpenId(id);
  }, []);

  const toggleSection = useCallback((id: string) => {
    setOpenId((current) => nextExclusiveOpenId(current, id));
  }, []);

  return { openId, openSection, toggleSection };
}
