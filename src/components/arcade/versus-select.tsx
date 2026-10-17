"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Fighter } from "@/lib/rdc-stats";
import { cn } from "@/lib/utils";
import { IdleSprite } from "./idle-sprite";
import { StageTitle } from "./stage-title";
import { FightBar, HpBar, PixelPortrait } from "./ui";

const percent = (share: number | null) =>
  share === null ? "--" : `${Math.round(share * 100)}%`;

/**
 * Fighter select: the fight bar on top, then 1P and 2P portrait cards either
 * side of the roster grid. Picking alternates 1P/2P; each tile also links to
 * that member's profile.
 */
export function VersusSelect({ fighters }: { fighters: Fighter[] }) {
  const [p1, setP1] = useState(0);
  const [p2, setP2] = useState(() => Math.min(1, fighters.length - 1));
  const [selecting, setSelecting] = useState<1 | 2>(1);
  /** Bumped by FIGHT to replay the slam-in on the VS and both cards. */
  const [round, setRound] = useState(0);

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
      <div className="border-ac-panel-2 border-b-2 bg-black">
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
        className="ac-grid bg-ac-ink relative overflow-hidden"
        aria-label={`${one.name} versus ${two.name}`}
      >
        <div
          aria-hidden
          className="from-ac-red/35 to-ac-blue/35 pointer-events-none absolute inset-0 bg-linear-to-r via-transparent"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-8 pb-10">
          <StageTitle />
          <p aria-live="polite" className="sr-only">
            Now selecting {selecting}P
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,1fr)] lg:gap-x-6">
            <Corner
              fighter={one}
              side={1}
              active={selecting === 1}
              round={round}
            />

            <div className="order-last col-span-2 flex flex-col justify-between gap-6 lg:order-none lg:col-span-1">
              <ul className="grid grid-cols-4 gap-2 md:gap-3">
                {fighters.map((fighter, i) => (
                  <Tile
                    key={fighter.slug}
                    fighter={fighter}
                    tag={i === p1 ? 1 : i === p2 ? 2 : null}
                    selecting={selecting}
                    onPick={() => pick(i)}
                  />
                ))}
              </ul>
              <div className="flex flex-col items-center gap-4">
                <span
                  key={`${one.slug}-${two.slug}-${round}`}
                  className="ac-title ac-glow text-ac-gold animate-slam-in text-5xl md:text-7xl"
                >
                  VS
                </span>
                <Button size="lg" onClick={() => setRound((r) => r + 1)}>
                  ▶ Fight
                </Button>
              </div>
            </div>

            <Corner
              fighter={two}
              side={2}
              active={selecting === 2}
              round={round}
            />
          </div>
        </div>
      </section>
    </>
  );
}

/** Roster tile: selects on click; the corner arrow opens the profile. */
function Tile({
  fighter,
  tag,
  selecting,
  onPick,
}: {
  fighter: Fighter;
  tag: 1 | 2 | null;
  selecting: 1 | 2;
  onPick: () => void;
}) {
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onPick}
        aria-pressed={tag !== null}
        aria-label={`Select ${fighter.name} as ${selecting}P`}
        className={cn(
          "group relative block aspect-square w-full cursor-pointer overflow-hidden border-2 bg-black transition-colors",
          tag === 1
            ? "border-ac-red"
            : tag === 2
              ? "border-ac-blue"
              : "border-ac-panel-2 hover:border-ac-cream/70",
        )}
      >
        {fighter.art.sprite ? (
          // Head-and-shoulders crop of the full-body sprite.
          <Image
            src={fighter.art.sprite.src}
            alt=""
            fill
            sizes="120px"
            className={cn(
              "origin-top scale-[1.6] object-cover object-top transition-opacity",
              tag === null && "opacity-70 group-hover:opacity-100",
            )}
          />
        ) : (
          <PixelPortrait
            src={fighter.art.portrait}
            alt=""
            pixels={28}
            className={cn(
              "absolute inset-0 transition-opacity",
              tag === null && "opacity-70 group-hover:opacity-100",
            )}
          />
        )}
        <span className="ac-label text-ac-cream absolute inset-x-0 bottom-0 bg-black/80 px-1 py-1 text-center">
          {fighter.name}
        </span>
      </button>
      <Link
        href={`/members/${fighter.slug}`}
        data-testid={`member-link-${fighter.slug}`}
        aria-label={`${fighter.name} profile`}
        className="bg-ac-ink/80 text-ac-cream/70 hover:text-ac-gold border-ac-panel-2 absolute top-1 right-1 z-10 grid size-5 place-items-center border text-xs"
      >
        ↗
      </Link>
    </li>
  );
}

/** One side of the stage: portrait card with the name, then its win card. */
function Corner({
  fighter,
  side,
  active,
  round,
}: {
  fighter: Fighter;
  side: 1 | 2;
  active: boolean;
  round: number;
}) {
  const one = side === 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        {active ? (
          <span
            aria-hidden
            className={cn(
              "animate-blink pointer-events-none absolute -inset-2 border-2 border-dashed",
              one ? "border-ac-red" : "border-ac-blue",
            )}
          />
        ) : null}
        <div
          key={`${fighter.slug}-${round}`}
          className={cn(
            "bg-ac-ink animate-rise-in relative aspect-[3/4] overflow-hidden border-4",
            one ? "border-ac-red" : "border-ac-blue",
          )}
        >
          {fighter.art.sprite ? (
            <>
              <div
                aria-hidden
                className={cn(
                  "ac-grid absolute inset-0 bg-radial-[at_50%_45%] to-transparent to-70%",
                  one ? "from-ac-red/45" : "from-ac-blue/45",
                )}
              />
              <IdleSprite
                sprite={fighter.art.sprite}
                alt={fighter.name}
                flip={!one}
                delay={one ? "0s" : "-0.7s"}
                priority
                className="absolute inset-x-2 top-[5%] bottom-[12%]"
              />
            </>
          ) : (
            <PixelPortrait
              src={fighter.art.portrait}
              alt={fighter.name}
              pixels={36}
              priority
              className="absolute inset-0"
            />
          )}
          <div
            aria-hidden
            className="from-ac-ink/95 absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t to-transparent"
          />
          <p
            className={cn(
              "ac-title ac-glow absolute bottom-2 text-base md:text-2xl",
              one ? "text-ac-red left-3" : "text-ac-blue right-3",
            )}
          >
            {fighter.name}
          </p>
        </div>
      </div>
      <WinCard fighter={fighter} side={side} />
    </div>
  );
}

function WinCard({ fighter, side }: { fighter: Fighter; side: 1 | 2 }) {
  const one = side === 1;
  return (
    <div className="border-ac-panel-2 bg-ac-panel border-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="ac-label text-ac-cream/80">Mario Kart 8</p>
        <p className="text-ac-cream text-xl tabular-nums">
          {fighter.wins ?? "--"}{" "}
          <span className="ac-label text-ac-cream/60">wins</span>
        </p>
      </div>
      <HpBar
        value={fighter.hp}
        variant={one ? "p1" : "p2"}
        align={one ? "left" : "right"}
        className="mt-2 h-4"
        label={`${fighter.name} health`}
      />
      <p className="ac-label text-ac-cream/60 mt-2">
        {percent(fighter.winShare)} win share
      </p>
    </div>
  );
}
