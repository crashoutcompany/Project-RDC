"use client";

import Image from "next/image";
import { useState } from "react";
import { Heading, SegmentedMeter } from "@/components/arcade/ui";
import { GamesEnum } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Fighter, SorryBoards, SorryRange } from "@/lib/rdc-stats";

const RANGES: { value: SorryRange; label: string }[] = [
  { value: "all", label: "All-time" },
  { value: "30d", label: "30 days" },
  { value: "last10", label: "Last 10" },
];

/**
 * Sorry scale with game and time filters. Every board is precomputed on the
 * server, so switching tabs is instant; the choice is mirrored into
 * `?sorryGame=&sorryRange=` with `replaceState` (no server round trip) so the
 * view stays shareable.
 */
export function SorryScale({
  roster,
  games,
  boards,
  initialGame,
  initialRange,
}: SorryBoards & {
  roster: Fighter[];
  initialGame: GamesEnum | "all";
  initialRange: SorryRange;
}) {
  const [game, setGame] = useState(initialGame);
  const [range, setRange] = useState(initialRange);

  const select = (next: { game?: GamesEnum | "all"; range?: SorryRange }) => {
    const g = next.game ?? game;
    const r = next.range ?? range;
    setGame(g);
    setRange(r);
    const params = new URLSearchParams(window.location.search);
    params.set("sorryGame", g);
    params.set("sorryRange", r);
    window.history.replaceState(null, "", `?${params}`);
  };

  const scores = new Map((boards[game]?.[range] ?? []).map((s) => [s.slug, s]));
  const hasData = [...scores.values()].some((s) => s.avgRank !== null);
  const gameName = games.find((g) => g.slug === game)?.name;

  return (
    <>
      <Heading lead="Sorry scale" className="text-ac-gold" />
      <p className="text-ac-cream/70 mt-2">
        {gameName
          ? `Average ranking in ${gameName}.`
          : "Average ranking across all games."}{" "}
        Emptiest health bar is the sorriest.
      </p>
      <div className="mt-4 mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Game">
          <FilterTab
            active={game === "all"}
            onClick={() => select({ game: "all" })}
          >
            All games
          </FilterTab>
          {games.map((g) => (
            <FilterTab
              key={g.slug}
              active={game === g.slug}
              onClick={() => select({ game: g.slug })}
            >
              {g.name}
            </FilterTab>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Time range">
          {RANGES.map((r) => (
            <FilterTab
              key={r.value}
              active={range === r.value}
              onClick={() => select({ range: r.value })}
            >
              {r.label}
            </FilterTab>
          ))}
        </div>
      </div>
      {hasData ? (
        <ul className="space-y-3">
          {roster.map((fighter) => {
            const score = scores.get(fighter.slug);
            const avgRank = score?.avgRank ?? null;
            return (
              <li key={fighter.slug} className="flex items-center gap-3">
                <Image
                  src={fighter.art.portrait}
                  alt=""
                  width={32}
                  height={32}
                  className="ac-pixel border-ac-panel-2 size-8 border-2 object-cover"
                />
                <span className="ac-label text-ac-cream w-20">
                  {fighter.name}
                </span>
                <SegmentedMeter
                  value={score?.fill ?? 0}
                  label={`${fighter.name} sorry scale`}
                  className="flex-1"
                />
                <span className="text-ac-cream/80 w-12 text-right text-2xl tabular-nums">
                  {avgRank === null ? "--" : avgRank.toFixed(1)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ac-label text-ac-cream/70 border-ac-panel-2 border-2 border-dashed p-6 text-center">
          No ranked matches in this range
        </p>
      )}
    </>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "ac-label cursor-pointer border-2 px-3 py-1.5 transition-colors",
        active
          ? "border-ac-gold bg-ac-gold text-ac-ink"
          : "border-ac-cream/40 text-ac-cream/80 hover:border-ac-cream",
      )}
    >
      {children}
    </button>
  );
}
