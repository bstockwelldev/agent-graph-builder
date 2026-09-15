import type { CSSProperties } from "react";
import { radius } from "@/lib/graph-theme";

type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
  className?: string;
};

export function Skeleton({ width = "100%", height = 16, style, className }: SkeletonProps) {
  return (
    <div
      className={className ? `agb-skeleton ${className}` : "agb-skeleton"}
      style={{ width, height, borderRadius: radius.lg, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} height={index === lines - 1 ? 12 : 16} width={index === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}
