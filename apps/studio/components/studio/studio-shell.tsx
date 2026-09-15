"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Sidebar } from "lucide-react";

import { StudioNav } from "@/components/studio/studio-nav";
import { StudioNavProvider } from "@/components/studio/studio-nav-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Single-segment graph canvas route: /graphs/:id (not /graphs, not
 * .../edit). Ported from MUI's isFlowCanvasRoute, renamed to match AGB's
 * "graph" noun. The canvas itself lands in Phase 4d — for now this only
 * controls the full-bleed layout (sidebar hidden) so 4d can drop the real
 * editor in without a shell change.
 */
export function isGraphCanvasRoute(pathname: string) {
  return /^\/graphs\/[^/]+$/.test(pathname);
}

export function StudioShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const safePathname = pathname ?? "";
  const graphCanvas = isGraphCanvasRoute(safePathname);
  const isGraphsListPage = safePathname === "/graphs";

  const openStudioNav = useCallback(() => {
    setMobileNavOpen(true);
  }, []);

  const navContextValue = useMemo(() => ({ openStudioNav }), [openStudioNav]);

  return (
    <StudioNavProvider value={navContextValue}>
      <div
        className={cn(
          "bg-background text-foreground flex min-h-dvh",
          isGraphsListPage && "h-dvh max-h-dvh min-h-0 overflow-hidden",
          className,
        )}
      >
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            className="bg-sidebar text-sidebar-foreground w-[17rem] border-sidebar-border gap-0 p-0"
            showCloseButton={false}
          >
            <div className="flex min-h-dvh flex-col gap-6 px-4 py-6">
              <StudioNav pathname={safePathname} onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <aside
          className={cn(
            "bg-sidebar text-sidebar-foreground shrink-0 flex-col gap-6 border-r border-sidebar-border px-4 py-6",
            // Graph canvas: keep aside fully hidden at all breakpoints — base `md:flex` would
            // otherwise override `hidden` at md+ and duplicate the Sheet nav.
            graphCanvas ? "hidden" : "hidden w-56 md:flex md:w-60",
          )}
          aria-label="Studio navigation"
          aria-hidden={graphCanvas}
        >
          <StudioNav pathname={safePathname} />
        </aside>
        <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header
            className={cn(
              "border-outline-variant/15 bg-surface-container-low/90 sticky top-0 z-40 flex h-12 items-center justify-between border-b px-3 backdrop-blur-md md:hidden",
              graphCanvas && "hidden",
            )}
          >
            <Link
              href="/graphs"
              className="text-sidebar-foreground text-sm font-semibold tracking-tight"
            >
              Agent Graph Studio
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <Sidebar className="size-4" aria-hidden />
            </Button>
          </header>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className={cn(
                graphCanvas
                  ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  : isGraphsListPage
                    ? "mx-auto flex w-full max-w-6xl min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-5 sm:py-6 md:px-6"
                    : "mx-auto w-full max-w-6xl px-4 py-4 sm:px-5 sm:py-6 md:px-6",
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </StudioNavProvider>
  );
}
