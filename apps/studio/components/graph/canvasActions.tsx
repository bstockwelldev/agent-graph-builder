"use client";

import { createContext, useContext } from "react";

/**
 * Callbacks that canvas-rendered components (node cards' NodeToolbar, edge
 * label chips) need from GraphEditor. React Flow only hands custom
 * nodes/edges their own `data`, so functions reach them through this
 * context instead of being copied into every node's data object
 * (studio-graph-workbench-redesign-plan.md, Slices 4 and 6).
 */
export type CanvasActions = {
  editNode: (nodeId: string) => void;
  runFromNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  focusNode: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  selectEdge: (edgeId: string) => void;
  /** Wave 7b visual groups: collapse/expand, and commit an inline rename
   * (`null` cancels). */
  toggleGroup: (groupId: string) => void;
  renameGroup: (groupId: string, label: string | null) => void;
};

const noop = () => {};

const CanvasActionsContext = createContext<CanvasActions>({
  editNode: noop,
  runFromNode: noop,
  duplicateNode: noop,
  focusNode: noop,
  deleteNode: noop,
  selectEdge: noop,
  toggleGroup: noop,
  renameGroup: noop,
});

export const CanvasActionsProvider = CanvasActionsContext.Provider;

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext);
}
