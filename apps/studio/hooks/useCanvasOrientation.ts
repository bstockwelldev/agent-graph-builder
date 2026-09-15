import { useEffect, useRef, useState, type RefObject } from "react";
import { computeEffectiveRankDir, layoutLabelForRankDir, type LayoutRankDir } from "../layout/dagreLayout";
import type { GraphOrientation } from "@bstockwelldev/agent-graph-sdk";

const DEBOUNCE_MS = 150;

export function useCanvasOrientation(
  paneRef: RefObject<HTMLElement | null>,
  orientationPin: GraphOrientation,
) {
  const [effectiveRankDir, setEffectiveRankDir] = useState<LayoutRankDir>("LR");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const paneSizeRef = useRef({ width: 0, height: 0 });
  const prevRankRef = useRef<LayoutRankDir | null>(null);
  const debounceRef = useRef<number | null>(null);
  const orientationPinRef = useRef(orientationPin);

  orientationPinRef.current = orientationPin;

  const announceIfChanged = (next: LayoutRankDir) => {
    if (prevRankRef.current !== null && prevRankRef.current !== next) {
      setLiveAnnouncement(`Graph layout: ${layoutLabelForRankDir(next)}`);
    }
    prevRankRef.current = next;
  };

  const applyRankDir = (width: number, height: number, pin: GraphOrientation) => {
    paneSizeRef.current = { width, height };
    setPaneSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    const next = computeEffectiveRankDir(width, height, pin);
    setEffectiveRankDir(next);
    announceIfChanged(next);
  };

  useEffect(() => {
    const element = paneRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        applyRankDir(width, height, orientationPinRef.current);
      }, DEBOUNCE_MS);
    });

    observer.observe(element);
    applyRankDir(element.clientWidth, element.clientHeight, orientationPin);

    return () => {
      observer.disconnect();
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [paneRef]);

  useEffect(() => {
    const { width, height } = paneSizeRef.current;
    if (width === 0 && height === 0) return;
    applyRankDir(width, height, orientationPin);
  }, [orientationPin]);

  return {
    effectiveRankDir,
    paneSize,
    liveAnnouncement,
    clearLiveAnnouncement: () => setLiveAnnouncement(""),
  };
}
