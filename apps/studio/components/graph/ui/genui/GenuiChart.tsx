"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { chart, chartSeries, fontFamily, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";

import { GenuiTable } from "./GenuiTable";

type Row = Record<string, unknown>;
type Kind = "bar" | "line" | "area";

const MARGIN = { top: 12, right: 16, bottom: 28, left: 48 };
const BAR_MAX = 24;
const GAP = 2;

/** Clean tick values from 0 (or the minimum, if negative) up past the max. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = max <= lo ? lo + 1 : max;
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= hi + step * 0.5 && ticks.length < 12; value += step) ticks.push(Number(value.toPrecision(12)));
  if (ticks[ticks.length - 1] < hi) ticks.push(Number((ticks[ticks.length - 1] + step).toPrecision(12)));
  return ticks;
}

const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * A GenUI Chart: bar (grouped), line or area over rows, one x key and up to
 * eight numeric y keys. Follows the dataviz method: thin marks (<= 24px bars
 * with a 4px rounded end, 2px lines, 8px end dots with a surface ring),
 * hairline grid, one axis, a legend for >= 2 series, a hover tooltip per x,
 * and a table view.
 */
export function GenuiChart({
  kind = "bar",
  rows,
  x,
  y,
  title,
  height = 200,
}: {
  kind?: Kind;
  rows: Row[];
  x: string;
  y: string[];
  title?: string;
  height?: number;
}) {
  const [ref, width] = useWidth(420);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const series = y.slice(0, chartSeries.length);

  const values = useMemo(
    () => rows.map((row) => series.map((key) => (typeof row[key] === "number" ? (row[key] as number) : Number(row[key])))),
    [rows, series],
  );
  const finite = values.flat().filter(Number.isFinite);
  if (rows.length === 0) return <Empty title={title} message="No rows to chart." />;
  if (finite.length === 0) return <Empty title={title} message={`No numeric values under ${series.join(", ")}.`} />;

  const ticks = niceTicks(Math.min(...finite), Math.max(...finite));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const band = plotW / rows.length;
  const yOf = (value: number) => MARGIN.top + plotH - ((value - lo) / (hi - lo)) * plotH;
  const baseline = yOf(Math.max(lo, 0));
  const xCenter = (index: number) => MARGIN.left + band * index + band / 2;
  const barWidth = Math.max(2, Math.min(BAR_MAX, (band * 0.7 - GAP * (series.length - 1)) / series.length));
  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(plotW / 64))));
  const label = (row: Row) => String(row[x] ?? "");

  return (
    <figure aria-labelledby={title ? titleId : undefined} style={{ margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing[2], marginBottom: spacing[1] }}>
        {title ? (
          <figcaption id={titleId} style={{ ...typeScale.small, color: text.primary }}>
            {title}
          </figcaption>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setAsTable((current) => !current)}
          aria-pressed={asTable}
          className="agb-focus-ring agb-hoverable"
          style={{ ...typeScale.caption, color: text.secondary, background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: radius.sm }}
        >
          {asTable ? "Chart" : "Table"}
        </button>
      </div>
      {series.length > 1 && !asTable ? (
        <ul aria-label="Legend" style={{ display: "flex", flexWrap: "wrap", gap: spacing[3], listStyle: "none", margin: `0 0 ${spacing[1]}px`, padding: 0 }}>
          {series.map((key, index) => (
            <li key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, ...typeScale.caption, color: text.secondary }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: chartSeries[index] }} />
              {key}
            </li>
          ))}
        </ul>
      ) : null}
      {asTable ? (
        <GenuiTable rows={rows} columns={[x, ...series]} />
      ) : (
        <div ref={ref} style={{ position: "relative", width: "100%" }}>
          <svg
            role="img"
            aria-label={`${title ?? "Chart"}: ${kind} chart of ${series.join(", ")} by ${x}, ${rows.length} points. Use the Table button for the values.`}
            width={width}
            height={height}
            style={{ display: "block", fontFamily: fontFamily.ui }}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yOf(tick)} y2={yOf(tick)} stroke={chart.grid} strokeWidth={1} />
                <text x={MARGIN.left - 6} y={yOf(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={text.secondary}>
                  {formatNumber(tick)}
                </text>
              </g>
            ))}
            {rows.map((row, index) =>
              index % labelEvery === 0 ? (
                <text key={index} x={xCenter(index)} y={height - 8} textAnchor="middle" fontSize={11} fill={text.secondary}>
                  {label(row).length > 12 ? `${label(row).slice(0, 11)}…` : label(row)}
                </text>
              ) : null,
            )}
            {hover !== null && kind !== "bar" ? (
              <line x1={xCenter(hover)} x2={xCenter(hover)} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke={text.secondary} strokeWidth={1} />
            ) : null}
            {kind === "bar"
              ? values.map((rowValues, index) => {
                  const groupWidth = series.length * barWidth + (series.length - 1) * GAP;
                  return rowValues.map((value, s) => {
                    if (!Number.isFinite(value)) return null;
                    const left = xCenter(index) - groupWidth / 2 + s * (barWidth + GAP);
                    const top = Math.min(yOf(value), baseline);
                    const h = Math.max(1, Math.abs(baseline - yOf(value)));
                    return <path key={`${index}-${s}`} d={barPath(left, top, barWidth, h, value >= 0)} fill={chartSeries[s]} opacity={hover === null || hover === index ? 1 : 0.55} />;
                  });
                })
              : series.map((key, s) => {
                  const points = values.map((rowValues, index) => [xCenter(index), rowValues[s]] as const).filter(([, value]) => Number.isFinite(value));
                  const line = points.map(([px, value], i) => `${i === 0 ? "M" : "L"}${px},${yOf(value)}`).join(" ");
                  const last = points[points.length - 1];
                  return (
                    <g key={key}>
                      {kind === "area" && points.length > 1 ? (
                        <path d={`${line} L${last[0]},${baseline} L${points[0][0]},${baseline} Z`} fill={chartSeries[s]} opacity={chart.areaOpacity} />
                      ) : null}
                      <path d={line} fill="none" stroke={chartSeries[s]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                      {last ? <circle cx={last[0]} cy={yOf(last[1])} r={4} fill={chartSeries[s]} stroke={surface.inset} strokeWidth={2} /> : null}
                      {hover !== null && Number.isFinite(values[hover][s]) ? (
                        <circle cx={xCenter(hover)} cy={yOf(values[hover][s])} r={4} fill={chartSeries[s]} stroke={surface.inset} strokeWidth={2} />
                      ) : null}
                    </g>
                  );
                })}
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={baseline} y2={baseline} stroke={text.secondary} strokeWidth={1} />
            {rows.map((_, index) => (
              // Hit targets span the whole band, bigger than the marks.
              <rect key={index} x={MARGIN.left + band * index} y={MARGIN.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(index)} />
            ))}
          </svg>
          {hover !== null ? (
            <div
              role="tooltip"
              style={{
                position: "absolute",
                top: MARGIN.top,
                left: Math.min(Math.max(0, xCenter(hover) + 12), width - 160),
                minWidth: 120,
                pointerEvents: "none",
                padding: spacing[2],
                borderRadius: radius.md,
                background: surface.card,
                border: `1px solid ${chart.grid}`,
                ...typeScale.caption,
                color: text.primary,
              }}
            >
              <div style={{ color: text.secondary, marginBottom: 4 }}>{label(rows[hover])}</div>
              {series.map((key, s) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: chartSeries[s] }} />
                  <span style={{ color: text.secondary }}>{key}</span>
                  <span style={{ marginLeft: "auto" }}>{Number.isFinite(values[hover][s]) ? formatNumber(values[hover][s]) : "—"}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {y.length > chartSeries.length ? (
        <p style={{ ...typeScale.caption, color: text.secondary, margin: `${spacing[1]}px 0 0` }}>
          Showing the first {chartSeries.length} of {y.length} series.
        </p>
      ) : null}
    </figure>
  );
}

/** A bar with a 4px rounded data end and a square baseline end. */
function barPath(x: number, y: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, w / 2, h);
  if (up) return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  return `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w - r} Q${x + w},${y + h} ${x + w},${y + h - r} V${y} Z`;
}

function Empty({ title, message }: { title?: string; message: string }) {
  return (
    <div>
      {title ? <div style={{ ...typeScale.small, color: text.primary }}>{title}</div> : null}
      <p style={{ ...typeScale.caption, color: text.secondary, margin: 0 }}>{message}</p>
    </div>
  );
}
