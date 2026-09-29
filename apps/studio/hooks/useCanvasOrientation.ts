import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
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

  // Only refs and state setters inside, so both are stable for the effects below.
  const applyRankDir = useCallback((width: number, height: number, pin: GraphOrientation) => {
    paneSizeRef.current = { width, height };
    setPaneSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    const next = computeEffectiveRankDir(width, height, pin);
    setEffectiveRankDir(next);
    if (prevRankRef.current !== null && prevRankRef.current !== next) {
      setLiveAnnouncement(`Graph layout: ${layoutLabelForRankDir(next)}`);
    }
    prevRankRef.current = next;
  }, []);
  const clearLiveAnnouncement = useCallback(() => setLiveAnnouncement(""), []);

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
    applyRankDir(element.clientWidth, element.clientHeight, orientationPinRef.current);

    return () => {
      observer.disconnect();
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [paneRef, applyRankDir]);

  useEffect(() => {
    const { width, height } = paneSizeRef.current;
    if (width === 0 && height === 0) return;
    applyRankDir(width, height, orientationPin);
  }, [orientationPin, applyRankDir]);

  return {
    effectiveRankDir,
    paneSize,
    liveAnnouncement,
    clearLiveAnnouncement,
  };
}
