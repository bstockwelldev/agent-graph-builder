"use client";

import Link from "next/link";
import { Workflow } from "lucide-react";

import { useStudioAccount } from "@/hooks/use-studio-account";
import { border, canvas, fontFamily, localType, radius, shadow, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";

/**
 * The canvas with no graph on it (canvas-first-landing-plan.md §3): the same
 * pane and dot grid as the graph editor, and one way forward, never a blank
 * screen. Styled from the canvas tokens, since it is the canvas.
 */
export function EmptyCanvas({ onOpenPicker }: { onOpenPicker: () => void }) {
  return (
    <div
      data-testid="empty-canvas"
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: canvas.pane,
        backgroundImage: `radial-gradient(circle, ${canvas.grid} 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }}
    >
      {/* There is no graph header here to hold the account, so it sits in the corner. */}
      <div style={{ position: "absolute", top: spacing[3], right: spacing[3] }}>
        <AccountControl />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: spacing[3],
          maxWidth: 360,
          padding: spacing[6],
          textAlign: "center",
          background: surface.panel,
          color: text.primary,
          border: `1px solid ${border.subtle}`,
          borderRadius: radius.xl,
          boxShadow: shadow[4],
        }}
      >
        <Workflow size={32} aria-hidden="true" style={{ color: text.secondary }} />
        <h1 style={{ margin: 0, ...typeScale.subheading, fontWeight: 600 }}>No graph open</h1>
        <p style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>Open one of your graphs or a demo, or start a blank graph.</p>
        <Button variant="primary" onClick={onOpenPicker}>
          Open or create a graph
        </Button>
        <p style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>
          or press <kbd style={{ fontFamily: fontFamily.mono }}>⌘O</kbd>
        </p>
      </div>
    </div>
  );
}

/** Sign in / sign out, for the empty canvas. Renders nothing when auth isn't configured. */
export function AccountControl() {
  const account = useStudioAccount();
  if (!account.configured || account.user === undefined) return null;

  if (!account.user) {
    return (
      <Link
        href={account.signInHref}
        className="agb-focus-ring agb-hoverable"
        style={{
          display: "inline-block",
          padding: `${spacing[2]}px ${spacing[3]}px`,
          borderRadius: radius.lg,
          border: `1px solid ${surface.borderStrong}`,
          background: surface.raised,
          color: text.primary,
          textDecoration: "none",
          ...localType.ui,
        }}
      >
        Sign in
      </Link>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
      <span style={{ ...typeScale.caption, color: text.secondary, maxWidth: 192, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={account.label}>
        {account.label}
      </span>
      <Button variant="ghost" onClick={account.signOut}>
        Sign out
      </Button>
    </div>
  );
}
