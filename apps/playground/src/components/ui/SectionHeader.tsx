import type { ReactNode } from "react";
import { spacing, typeScale } from "../../theme";

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...typeScale.small,
        fontWeight: 600,
        marginBottom: spacing[2],
      }}
    >
      {children}
    </div>
  );
}
