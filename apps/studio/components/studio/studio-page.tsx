import { cn } from "@/lib/utils";

export function StudioPage({
  children,
  className,
  /** Fill parent flex height; use an inner scroll region for long content (no document scroll). */
  viewport = false,
}: {
  children: React.ReactNode;
  className?: string;
  viewport?: boolean;
}) {
  return (
    <div
      className={cn(
        viewport
          ? "flex min-h-0 flex-1 flex-col gap-6 overflow-hidden"
          : "space-y-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
