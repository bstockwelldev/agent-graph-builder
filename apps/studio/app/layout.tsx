import type { Metadata } from "next";

import { StudioDataProvider } from "@/components/studio/StudioDataProvider";
import { StudioShell } from "@/components/studio/studio-shell";
import { WorkbenchProvider } from "@/components/workbench/WorkbenchProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Graph Studio",
  description: "Visual graph authoring and run console for Agent Graph Builder",
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
