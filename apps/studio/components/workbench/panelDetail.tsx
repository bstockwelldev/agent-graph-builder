import Link from "next/link";
import type { ReactNode } from "react";

import { color, fontFamily, spacing, text, typeScale } from "@/lib/graph-theme";

// The compact line under an item in a resource panel (`renderPanelDetail` in
// components/studio/resource-kinds.tsx): key facts and links, in the canvas's
// tokens.

export function DetailRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: spacing[2], rowGap: 2 }}>{children}</div>;
}

export function DetailMeta({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <span style={{ ...typeScale.caption, color: text.secondary, fontFamily: mono ? fontFamily.mono : undefined }}>{children}</span>;
}

export function DetailLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label} className="agb-focus-ring" style={{ ...typeScale.caption, fontWeight: 500, color: color.primary[500], textDecoration: "none" }}>
      {children}
    </Link>
  );
}
