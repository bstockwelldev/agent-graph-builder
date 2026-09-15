import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
