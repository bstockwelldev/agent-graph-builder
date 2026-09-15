"use client";

import { createContext, useContext } from "react";

export type StudioNavContextValue = {
  openStudioNav: () => void;
};

const StudioNavContext = createContext<StudioNavContextValue | null>(null);

export function StudioNavProvider({
  value,
  children,
}: {
  value: StudioNavContextValue;
  children: React.ReactNode;
}) {
  return (
    <StudioNavContext.Provider value={value}>
      {children}
    </StudioNavContext.Provider>
  );
}

export function useStudioNav(): StudioNavContextValue {
  const ctx = useContext(StudioNavContext);
  if (!ctx) {
    return { openStudioNav: () => {} };
  }
  return ctx;
}
