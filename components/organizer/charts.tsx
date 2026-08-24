"use client";

import { useId, useState } from "react";
import { useFormat, useT } from "@/components/i18n/provider";
import type { Translate } from "@/lib/i18n/translate";
import { domainLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";

/**
 * Charts are plain inline SVG — no charting dependency.
 *
 * Colour policy: single-series charts use a brand neon (identity is carried by
 * the title, so there is no categorical constraint). The one two-series chart
 * uses a pair validated for colour-vision deficiency — the brand's lime and
 * yellow are indistinguishable to protanopes (ΔE 0.4), so they are never used
 * to separate series. That pair also ships a legend and direct labels.
 */
const SERIES_A = "#61A400"; // validated against SERIES_B: ΔE 30.4 protan
const SERIES_B = "#3D82F0";
const SURFACE = "#0d0d0d";
const GRID = "#242424";

type Point = { label: string; value: number };

/**
 * Series labels come from the fixtures as canonical strings (`Mar`,
 * `Under 20`). They are translated at render, falling back to the raw
 * value — week numbers like `W23` read the same in both languages.
 */
function seriesLabel(t: Translate, value: string): string {
  return domainLabel(t, "series", value);
}

function niceTicks(max: number, count = 4): number[] {
  const step = Math.ceil(max / count / 10) * 10;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

function ChartFrame({
  title,
  subtitle,
  children,
  table,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const t = useT();

  return (
    <figure className="m-0 border-2 border-line bg-carbon">
      <figcaption className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-line px-5 py-4">
        <div>
          <h3 className="text-[15px] font-extrabold tracking-wide uppercase">
            {title}
          </h3>
          <p className="mt-1 text-xs text-fg-dim">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="border-2 border-line-strong px-2.5 py-1.5 font-mono text-[10px] tracking-[0.14em] text-fg-dim uppercase hover:border-fg-dim hover:text-fg"
        >
          {showTable ? t("charts.chart") : t("charts.table")}
        </button>
      </figcaption>
      <div className="p-5">{showTable ? table : children}</div>
    </figure>
  );
}

function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="border-b-2 border-line px-3 py-2 text-left font-mono text-[10px] tracking-[0.14em] text-fg-dim uppercase"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "border-b border-line px-3 py-2",
                    j > 0 && "font-mono tabular-nums",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Registrations over time — single series, line + area wash          */
/* ------------------------------------------------------------------ */

export function RegistrationsChart({ data }: { data: Point[] }) {
  const t = useT();
  const fmt = useFormat();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const W = 640;
  const H = 220;
  const PAD = { top: 16, right: 20, bottom: 28, left: 44 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1];

  const x = (i: number) => PAD.left + (i / (data.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const areaPath = `${linePath} L${x(data.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;

  const last = data.length - 1;
  const active = hover ?? last;

  return (
    <ChartFrame
      title={t("charts.registrationsTitle")}
      subtitle={t("charts.registrationsSubtitle")}
      table={
        <DataTable
          columns={[t("charts.week"), t("charts.registrations")]}
          rows={data.map((d) => [seriesLabel(t, d.label), fmt.number(d.value)])}
        />
      }
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={t("charts.registrationsAria", {
            max: fmt.number(max),
            label: seriesLabel(
              t,
              data.find((d) => d.value === max)?.label ?? "",
            ),
          })}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9CFF00" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#9CFF00" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive gridlines — hairline, solid, one step off surface. */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke={GRID}
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-[#8a8a8a] font-mono text-[10px] tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="#9CFF00"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Crosshair for the hovered week. */}
          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="#8a8a8a"
              strokeWidth="1"
            />
          ) : null}

          {/* End marker, ringed in the surface colour so it clears the line. */}
          <circle
            cx={x(active)}
            cy={y(data[active].value)}
            r="5"
            fill="#9CFF00"
            stroke={SURFACE}
            strokeWidth="2"
          />

          {data.map((d, i) => (
            <g key={d.label}>
              {/* Generous invisible hit target, wider than the mark. */}
              <rect
                x={x(i) - plotW / data.length / 2}
                y={PAD.top}
                width={plotW / data.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {i % 2 === 0 ? (
                <text
                  x={x(i)}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-[#6c6c6c] font-mono text-[10px]"
                >
                  {seriesLabel(t, d.label)}
                </text>
              ) : null}
            </g>
          ))}
        </svg>

        <p
          aria-live="polite"
          className="mt-2 font-mono text-[11px] tracking-[0.12em] text-fg-dim uppercase"
        >
          {seriesLabel(t, data[active].label)}:{" "}
          <span className="text-neon-lime">
            {fmt.number(data[active].value)}
          </span>{" "}
          {t("charts.registrations")}
        </p>
      </div>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Revenue — single-series columns                                     */
/* ------------------------------------------------------------------ */

export function RevenueChart({ data }: { data: Point[] }) {
  const t = useT();
  const fmt = useFormat();
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = 220;
  const PAD = { top: 20, right: 12, bottom: 28, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data.map((d) => d.value));
  const yMax = Math.ceil(max / 2000) * 2000;
  const band = plotW / data.length;
  const barW = Math.min(24, band - 12); // capped; leftover band is air

  return (
    <ChartFrame
      title={t("charts.revenueTitle")}
      subtitle={t("charts.revenueSubtitle")}
      table={
        <DataTable
          columns={[t("charts.month"), t("charts.revenue")]}
          rows={data.map((d) => [
            seriesLabel(t, d.label),
            fmt.moneyWhole(d.value),
          ])}
        />
      }
    >
      <div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={t("charts.revenueAria", {
            label: seriesLabel(
              t,
              data.find((d) => d.value === max)?.label ?? "",
            ),
            max: fmt.moneyWhole(max),
          })}
          onMouseLeave={() => setHover(null)}
        >
          {[0, yMax / 2, yMax].map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={PAD.top + plotH - (t / yMax) * plotH}
                y2={PAD.top + plotH - (t / yMax) * plotH}
                stroke={GRID}
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={PAD.top + plotH - (t / yMax) * plotH + 4}
                textAnchor="end"
                className="fill-[#8a8a8a] font-mono text-[10px] tabular-nums"
              >
                ${(t / 1000).toFixed(0)}k
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const h = (d.value / yMax) * plotH;
            const bx = PAD.left + i * band + (band - barW) / 2;
            const by = PAD.top + plotH - h;
            return (
              <g
                key={d.label}
                onMouseEnter={() => setHover(i)}
                className="cursor-default"
              >
                <rect
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                />
                {/* 4px rounded cap, square at the baseline. */}
                <path
                  d={`M${bx},${PAD.top + plotH} L${bx},${by + 4} Q${bx},${by} ${bx + 4},${by} L${bx + barW - 4},${by} Q${bx + barW},${by} ${bx + barW},${by + 4} L${bx + barW},${PAD.top + plotH} Z`}
                  fill="#FFF200"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
                {/* Value on the cap, only for the hovered or largest column. */}
                {hover === i || (hover === null && d.value === max) ? (
                  <text
                    x={bx + barW / 2}
                    y={by - 7}
                    textAnchor="middle"
                    className="fill-[#ffffff] font-mono text-[11px] tabular-nums"
                  >
                    ${(d.value / 1000).toFixed(1)}k
                  </text>
                ) : null}
                <text
                  x={bx + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-[#6c6c6c] font-mono text-[10px]"
                >
                  {seriesLabel(t, d.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Demographics — two series, grouped columns                          */
/* ------------------------------------------------------------------ */

export function DemographicsChart({
  data,
}: {
  data: { label: string; women: number; men: number }[];
}) {
  const t = useT();
  const fmt = useFormat();
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = 240;
  const PAD = { top: 20, right: 12, bottom: 28, left: 44 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data.flatMap((d) => [d.women, d.men]));
  const yMax = Math.ceil(max / 50) * 50;
  const band = plotW / data.length;
  // Two bars plus a 2px surface gap between them; the rest of the band is air.
  const barW = Math.min(20, (band - 16 - 2) / 2);

  return (
    <ChartFrame
      title={t("charts.demographicsTitle")}
      subtitle={t("charts.demographicsSubtitle")}
      table={
        <DataTable
          columns={[
            t("charts.ageGroup"),
            t("charts.women"),
            t("charts.men"),
          ]}
          rows={data.map((d) => [
            seriesLabel(t, d.label),
            fmt.number(d.women),
            fmt.number(d.men),
          ])}
        />
      }
    >
      <div>
        {/* Legend — always present at two or more series. */}
        <div className="mb-4 flex flex-wrap gap-5">
          {[
            { name: t("charts.women"), color: SERIES_A },
            { name: t("charts.men"), color: SERIES_B },
          ].map((s) => (
            <span
              key={s.name}
              className="flex items-center gap-2 text-xs text-fg-muted"
            >
              <span
                aria-hidden="true"
                className="h-3 w-3"
                style={{ background: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={t("charts.demographicsAria")}
          onMouseLeave={() => setHover(null)}
        >
          {[0, yMax / 2, yMax].map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={PAD.top + plotH - (t / yMax) * plotH}
                y2={PAD.top + plotH - (t / yMax) * plotH}
                stroke={GRID}
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={PAD.top + plotH - (t / yMax) * plotH + 4}
                textAnchor="end"
                className="fill-[#8a8a8a] font-mono text-[10px] tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const groupX = PAD.left + i * band + (band - (barW * 2 + 2)) / 2;
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)}>
                <rect
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                />
                {[
                  { v: d.women, color: SERIES_A, offset: 0 },
                  { v: d.men, color: SERIES_B, offset: barW + 2 },
                ].map((s, si) => {
                  const h = (s.v / yMax) * plotH;
                  const bx = groupX + s.offset;
                  const by = PAD.top + plotH - h;
                  return (
                    <g key={si}>
                      <path
                        d={`M${bx},${PAD.top + plotH} L${bx},${by + 4} Q${bx},${by} ${bx + 4},${by} L${bx + barW - 4},${by} Q${bx + barW},${by} ${bx + barW},${by + 4} L${bx + barW},${PAD.top + plotH} Z`}
                        fill={s.color}
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                      {/* Direct labels on hover — the secondary encoding that
                          backs up hue for the tritan case. */}
                      {hover === i ? (
                        <text
                          x={bx + barW / 2}
                          y={by - 6}
                          textAnchor="middle"
                          className="fill-[#ffffff] font-mono text-[10px] tabular-nums"
                        >
                          {s.v}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                <text
                  x={PAD.left + i * band + band / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-[#6c6c6c] font-mono text-[10px]"
                >
                  {seriesLabel(t, d.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}
