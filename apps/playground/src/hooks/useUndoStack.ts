import { useCallback, useRef, useState } from "react";
import type { CanvasSnapshot } from "../lib/graphAuthoring";

const DEFAULT_MAX_DEPTH = 50;

export function useUndoStack(maxDepth = DEFAULT_MAX_DEPTH) {
  const [undoStack, setUndoStack] = useState<CanvasSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasSnapshot[]>([]);
  const isApplyingRef = useRef(false);

  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const pushSnapshot = useCallback(
    (snapshot: CanvasSnapshot) => {
      if (isApplyingRef.current) return;
      setUndoStack((stack) => [...stack.slice(-(maxDepth - 1)), snapshot]);
      setRedoStack([]);
    },
    [maxDepth],
  );

  const undo = useCallback(
    (current: CanvasSnapshot): CanvasSnapshot | null => {
      if (undoStack.length === 0) return null;
      isApplyingRef.current = true;
      const previous = undoStack[undoStack.length - 1];
      setUndoStack((stack) => stack.slice(0, -1));
      setRedoStack((stack) => [...stack, current]);
      isApplyingRef.current = false;
      return previous;
    },
    [undoStack],
  );

  const redo = useCallback(
    (current: CanvasSnapshot): CanvasSnapshot | null => {
      if (redoStack.length === 0) return null;
      isApplyingRef.current = true;
      const next = redoStack[redoStack.length - 1];
      setRedoStack((stack) => stack.slice(0, -1));
      setUndoStack((stack) => [...stack, current]);
      isApplyingRef.current = false;
      return next;
    },
    [redoStack],
  );

  return {
    pushSnapshot,
    undo,
    redo,
    clearHistory,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
