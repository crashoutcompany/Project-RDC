"use client";

import Image from "next/image";
import { useState } from "react";
import type { GamesEnum } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Metric = "matches" | "sets" | "days";

export type WinsMatrixProps = {
  arenas: { slug: GamesEnum; short: string; bar: string }[];
  rows: {
    slug: string;
    name: string;
    portrait: string;
    /** Per arena slug: wins by metric, or null when the arena has no data. */
    cells: Record<string, Record<Metric, number> | null>;
  }[];
};

const METRICS: { key: Metric; label: string }[] = [
  { key: "matches", label: "Matches" },
  { key: "sets", label: "Sets" },
  { key: "days", label: "Days" },
];

/** Every fighter × every arena. Brighter cell = more wins in that column. */
export function WinsMatrix({ arenas, rows }: WinsMatrixProps) {
  const [metric, setMetric] = useState<Metric>("matches");
  const max = Object.fromEntries(
    arenas.map((a) => [
      a.slug,
      Math.max(0, ...rows.map((r) => r.cells[a.slug]?.[metric] ?? 0)),
    ]),
  );

  return (
    <div>
      <div
        className="mb-4 flex justify-end gap-2"
        role="group"
        aria-label="Win type"
      >
        {METRICS.map((m) => (
          <Button
            key={m.key}
            type="button"
            size="sm"
            variant={metric === m.key ? "default" : "outline"}
            aria-pressed={metric === m.key}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="ac-label text-ac-cream/70 text-left">Fighter</th>
              {arenas.map((a) => (
                <th key={a.slug} className="ac-label text-ac-cream pb-1">
                  {a.short}
                  <div className={cn("mt-1 h-1", a.bar)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slug}>
                <th scope="row" className="py-1 pr-3 text-left">
                  <span className="flex items-center gap-3">
                    <Image
                      src={row.portrait}
                      alt=""
                      width={28}
                      height={28}
                      className="ac-pixel size-7 object-cover"
                    />
                    <span className="ac-label text-ac-cream">{row.name}</span>
                  </span>
                </th>
                {arenas.map((a) => {
                  const value = row.cells[a.slug]?.[metric];
                  const strength =
                    value && max[a.slug] ? value / max[a.slug] : 0;
                  return (
                    <td
                      key={a.slug}
                      className="bg-ac-panel-2/60 relative h-10 text-center"
                    >
                      <span
                        aria-hidden
                        className={cn("absolute inset-0", a.bar)}
                        style={{ opacity: strength * 0.85 }}
                      />
                      <span className="text-ac-cream relative text-2xl tabular-nums">
                        {value === undefined ? "--" : value}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
