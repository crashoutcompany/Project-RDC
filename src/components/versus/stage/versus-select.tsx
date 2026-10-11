"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { Fighter } from "@/lib/rdc-stats";
import { cn } from "@/lib/utils";
import { FightBar, HpBar, SkewPortrait } from "../ui";
import {
  useInView,
  useSlotRefs,
  useStageRoot,
  useStageSupport,
} from "./use-stage-support";
import type { StageSlot } from "./stage-canvas";

const StageCanvas = dynamic(() => import("./stage-canvas"), { ssr: false });

const percent = (share: number | null) =>
  share === null ? "--" : `${Math.round(share * 100)}%`;

/**
 * Fighter select: pick 1P and 2P from the grid and they square up on the 3D
 * stage, turning to face each other. Name strips link to each profile.
 */
export function VersusSelect({ fighters }: { fighters: Fighter[] }) {
  const [p1, setP1] = useState(0);
  const [p2, setP2] = useState(Math.min(1, fighters.length - 1));
  const [selecting, setSelecting] = useState<1 | 2>(1);
  const [slotEls, setSlotEls] = useState<(HTMLElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const slotRefs = useSlotRefs(2, setSlotEls);
  const { anchor: stageAnchor, root: stageRoot } = useStageRoot();
  const inView = useInView(stageRoot);
  const { webgl, reducedMotion } = useStageSupport();

  const one = fighters[p1];
  const two = fighters[p2];

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

  const slots: StageSlot[] = useMemo(
    () =>
      one && two
        ? [
            { id: `p1-${one.slug}`, art: one.art, el: slotEls[0] ?? null, yaw: 0.65, frame: "red" },
            { id: `p2-${two.slug}`, art: two.art, el: slotEls[1] ?? null, yaw: -0.65, frame: "blue" },
          ]
        : [],
    [one, two, slotEls],
  );

  const show3d = webgl === true && !failed;
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => setFailed(true), []);

  if (!one || !two) return null;

  return (
    <>
      <div className="bg-vs-ink border-vs-panel-2 border-b">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <FightBar
            left={one.name}
            right={two.name}
            leftValue={one.hp}
            rightValue={two.hp}
          />
        </div>
      </div>

      <section
        data-stage-root
        className="vs-dusk relative isolate overflow-hidden"
        aria-label={`${one.name} versus ${two.name}`}
      >
        <span ref={stageAnchor} hidden />
        {show3d ? (
          <div
            className={cn(
              "absolute inset-0 -z-10 transition-opacity duration-700",
              ready ? "opacity-100" : "opacity-0",
            )}
          >
            <StageCanvas
              slots={slots}
              container={stageRoot}
              animate={!reducedMotion}
              active={inView}
              onReady={onReady}
              onError={onError}
            />
          </div>
        ) : null}
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-end gap-4 px-4 pt-8 pb-6">
          <SlotFrame fighter={one} side={1} ready={show3d && ready} slotRef={slotRefs[0]} />
          <div className="flex flex-col items-center gap-6 self-center">
            <span
              key={`${one.slug}-${two.slug}`}
              className="vs-title text-vs-gold animate-slam-in text-8xl drop-shadow-[4px_4px_0_#d7192f] md:text-9xl"
            >
              VS
            </span>
          </div>
          <SlotFrame fighter={two} side={2} ready={show3d && ready} slotRef={slotRefs[1]} />
        </div>
        <div className="bg-vs-ink/70 relative backdrop-blur-sm">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-4">
            <TaleOfTheTape fighter={one} side={1} />
            <TaleOfTheTape fighter={two} side={2} />
          </div>
        </div>
      </section>

      <section className="bg-vs-panel">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="vs-title text-vs-cream text-5xl md:text-6xl">
              Select your <span className="text-vs-gold">fighter</span>
            </h2>
            <p
              aria-live="polite"
              className={cn(
                "vs-label",
                selecting === 1 ? "text-vs-red" : "text-vs-blue",
              )}
            >
              Now selecting {selecting}P
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {fighters.map((fighter, i) => {
              const tag = i === p1 ? "1P" : i === p2 ? "2P" : null;
              return (
                <li
                  key={fighter.slug}
                  className={cn(
                    "group bg-vs-ink relative border-4 transition-colors",
                    i === p1
                      ? "border-vs-red"
                      : i === p2
                        ? "border-vs-blue"
                        : "border-vs-panel-2 hover:border-vs-cream/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    aria-pressed={tag !== null}
                    aria-label={`Select ${fighter.name} as ${selecting}P`}
                    className="relative block aspect-square w-full cursor-pointer overflow-hidden"
                  >
                    <Image
                      src={fighter.art.portrait}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, 25vw"
                      className={cn(
                        "object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none",
                        tag ? "" : "grayscale-[60%]",
                      )}
                    />
                    {tag ? (
                      <span
                        className={cn(
                          "vs-title text-vs-cream absolute top-0 left-0 px-2 pt-1 text-2xl",
                          tag === "1P" ? "bg-vs-red" : "bg-vs-blue",
                        )}
                      >
                        {tag}
                      </span>
                    ) : null}
                  </button>
                  <Link
                    href={`/members/${fighter.slug}`}
                    data-testid={`member-link-${fighter.slug}`}
                    className="from-vs-ink absolute inset-x-0 bottom-0 flex items-end justify-between bg-linear-to-t to-transparent px-3 pt-8 pb-2"
                  >
                    <span className="vs-title text-vs-cream hover:text-vs-gold text-3xl not-italic">
                      {fighter.name}
                    </span>
                    <span className="vs-label text-vs-cream/80 tracking-normal normal-case">
                      Profile ›
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

function SlotFrame({
  fighter,
  side,
  ready,
  slotRef,
}: {
  fighter: Fighter;
  side: 1 | 2;
  ready: boolean;
  slotRef: (el: HTMLElement | null) => void;
}) {
  return (
    <div className={cn("flex flex-col", side === 2 && "items-end")}>
      <div
        ref={slotRef}
        className="relative aspect-[3/4] w-full max-w-72"
      >
        <SkewPortrait
          key={fighter.slug}
          src={fighter.art.portrait}
          alt={fighter.name}
          sizes="300px"
          priority
          className={cn(
            "animate-rise-in absolute inset-0 transition-opacity duration-500",
            ready && "opacity-0",
          )}
        />
      </div>
      <p
        className={cn(
          "vs-title text-vs-cream -mt-10 text-6xl drop-shadow-[3px_3px_0_rgba(0,0,0,0.7)] md:text-7xl",
          side === 2 && "text-right",
        )}
      >
        {fighter.name}
      </p>
    </div>
  );
}

function TaleOfTheTape({ fighter, side }: { fighter: Fighter; side: 1 | 2 }) {
  return (
    <div className={cn(side === 2 && "text-right")}>
      <p className="vs-label text-vs-cream/80">
        {side}P · Mario Kart 8
      </p>
      <p className="vs-title text-vs-cream text-3xl">
        {fighter.wins ?? "--"} <span className="text-vs-cream/60 text-xl">wins</span>
        {" · "}
        <span className={side === 1 ? "text-vs-red" : "text-vs-blue"}>
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
