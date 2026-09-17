import type { Metadata } from "next";

import { StudioShell } from "@/components/studio/studio-shell";

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
        <StudioShell>{children}</StudioShell>
      </body>
    </html>
  );
}
