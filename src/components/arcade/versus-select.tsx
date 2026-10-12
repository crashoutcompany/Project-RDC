"use client";

import Link from "next/link";
import { useState } from "react";
import type { Fighter } from "@/lib/rdc-stats";
import { cn } from "@/lib/utils";
import { FightBar, HpBar, PixelPortrait } from "./ui";

const percent = (share: number | null) =>
  share === null ? "--" : `${Math.round(share * 100)}%`;

/**
 * Fighter select: pick 1P and 2P from the grid and they square up in the
 * versus frames. Name strips link to each profile.
 */
export function VersusSelect({ fighters }: { fighters: Fighter[] }) {
  const [p1, setP1] = useState(0);
  const [p2, setP2] = useState(() => Math.min(1, fighters.length - 1));
  const [selecting, setSelecting] = useState<1 | 2>(1);

  const one = fighters[p1];
  const two = fighters[p2];
  if (!one || !two) return null;

  const pick = (i: number) => {
    if (selecting === 1) {
      if (i === p2) setP2(p1);
      setP1(i);
      setSelecting(2);
    } else {
      if (i === p1) setP1(p2);
      setP2(i);
      setSelecting(1);
    }
  };

  return (
    <>
      <div className="bg-ac-ink border-ac-panel-2 border-b-2">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <FightBar
            left={one.name}
            right={two.name}
            leftValue={one.hp}
            rightValue={two.hp}
          />
        </div>
      </div>

      <section
        className="ac-dusk relative overflow-hidden"
        aria-label={`${one.name} versus ${two.name}`}
      >
        <div
          aria-hidden
          className="from-ac-red/35 to-ac-blue/35 pointer-events-none absolute inset-0 bg-linear-to-r via-transparent"
        />
        <div className="relative mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 pt-10 pb-8">
          <Slot fighter={one} side={1} />
          <span
            key={`${one.slug}-${two.slug}`}
            className="ac-title ac-glow text-ac-gold animate-slam-in text-4xl md:text-6xl"
          >
            VS
          </span>
          <Slot fighter={two} side={2} />
        </div>
        <div className="bg-ac-ink/80 relative">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-4">
            <Tape fighter={one} side={1} />
            <Tape fighter={two} side={2} />
          </div>
        </div>
      </section>

      <section className="ac-grid bg-ac-ink">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="ac-title text-ac-cream text-2xl md:text-3xl">
              Select your fighter
            </h2>
            <p
              aria-live="polite"
              className={cn(
                "ac-label",
                selecting === 1 ? "text-ac-red" : "text-ac-blue",
              )}
            >
              Now selecting {selecting}P
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {fighters.map((fighter, i) => {
              const tag = i === p1 ? "1P" : i === p2 ? "2P" : null;
              return (
                <li
                  key={fighter.slug}
                  className={cn(
                    "bg-ac-panel relative border-2 transition-colors",
                    tag === "1P"
                      ? "border-ac-red"
                      : tag === "2P"
                        ? "border-ac-blue"
                        : "border-ac-panel-2 hover:border-ac-cream/70",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    aria-pressed={tag !== null}
                    aria-label={`Select ${fighter.name} as ${selecting}P`}
                    className="relative block w-full cursor-pointer"
                  >
                    <PixelPortrait
                      src={fighter.art.portrait}
                      alt=""
                      pixels={28}
                      className="aspect-square"
                    />
                    {tag ? (
                      <span
                        className={cn(
                          "ac-label text-ac-ink absolute top-1.5 left-1.5 px-1.5 py-0.5",
                          tag === "1P" ? "bg-ac-red" : "bg-ac-blue",
                        )}
                      >
                        {tag}
                      </span>
                    ) : null}
                  </button>
                  <Link
                    href={`/members/${fighter.slug}`}
                    data-testid={`member-link-${fighter.slug}`}
                    className="bg-ac-ink flex items-center justify-between px-2 py-2"
                  >
                    <span className="ac-label text-ac-cream hover:text-ac-gold">
                      {fighter.name}
                    </span>
                    <span className="text-ac-cream/60 text-base">
                      @{fighter.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}

function Slot({ fighter, side }: { fighter: Fighter; side: 1 | 2 }) {
  const color = side === 1 ? "border-ac-red" : "border-ac-blue";
  return (
    <div className={cn("flex flex-col gap-3", side === 2 && "items-end")}>
      <div className={cn("bg-ac-ink relative w-full max-w-64 border-4 p-1", color)}>
        <span
          className={cn(
            "ac-label text-ac-ink absolute top-2 z-10 px-1.5 py-0.5",
            side === 1 ? "bg-ac-red left-2" : "bg-ac-blue right-2",
          )}
        >
          {side}P
        </span>
        <PixelPortrait
          key={fighter.slug}
          src={fighter.art.portrait}
          alt={fighter.name}
          pixels={36}
          priority
          className="animate-rise-in aspect-square"
        />
      </div>
      <p
        className={cn(
          "ac-title ac-glow text-xl md:text-3xl",
          side === 1 ? "text-ac-red" : "text-ac-blue text-right",
        )}
      >
        {fighter.name}
      </p>
    </div>
  );
}

function Tape({ fighter, side }: { fighter: Fighter; side: 1 | 2 }) {
  return (
    <div className={cn(side === 2 && "text-right")}>
      <p className="ac-label text-ac-cream/70">{side}P · Mario Kart 8</p>
      <p className="text-ac-cream text-2xl">
        {fighter.wins ?? "--"} wins ·{" "}
        <span className={side === 1 ? "text-ac-red" : "text-ac-blue"}>
          {percent(fighter.winShare)}
        </span>
      </p>
      <HpBar
        value={fighter.hp}
        variant={side === 1 ? "p1" : "p2"}
        align={side === 1 ? "left" : "right"}
        className="mt-1 h-4"
        label={`${fighter.name} health`}
      />
    </div>
  );
}
