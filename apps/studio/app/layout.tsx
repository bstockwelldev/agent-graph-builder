import type { Metadata, Viewport } from "next";

import { StudioDataProvider } from "@/components/studio/StudioDataProvider";
import { StudioShell } from "@/components/studio/studio-shell";
import { WorkbenchProvider } from "@/components/workbench/WorkbenchProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Graph Studio",
  description: "Visual graph authoring and run console for Agent Graph Builder",
};

// `viewport-fit=cover`: without it iOS Safari reports zero safe-area insets,
// so `env(safe-area-inset-bottom)` in the mobile tab bar (and the compact
// selection dock) evaluates to 0 and the bottom tray sits flush against the
// screen edge -- its tabs land inside the home-indicator gesture zone / the
// bottom-edge toolbar-reveal zone and taps never reach them (STO-607
// follow-up: "tray not selectable" on iPhone). With `cover` the insets are
// real and the existing `pb-[env(safe-area-inset-bottom)]` /
// `calc(... + env(safe-area-inset-top))` offsets clear the unsafe areas.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <StudioDataProvider>
          <WorkbenchProvider>
            <StudioShell>{children}</StudioShell>
          </WorkbenchProvider>
        </StudioDataProvider>
      </body>
    </html>
  );
}
