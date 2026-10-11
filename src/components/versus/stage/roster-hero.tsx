"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { Fighter } from "@/lib/rdc-stats";
import { cn } from "@/lib/utils";
import { HpBar, SkewPortrait } from "../ui";
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
 * Home hero roster: eight fighters on the 3D dusk stage, paired off and
 * turning to square up, each above a win-share HP bar. Without WebGL (or
 * before it loads) the same slots show flat skewed portraits.
 */
export function RosterHero({ fighters }: { fighters: Fighter[] }) {
  const { anchor: stageAnchor, root: stageRoot } = useStageRoot();
  const [slotEls, setSlotEls] = useState<(HTMLElement | null)[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { webgl, reducedMotion } = useStageSupport();
  const inView = useInView(stageRoot);

  const slotRefs = useSlotRefs(fighters.length, setSlotEls);

  const slots: StageSlot[] = useMemo(
    () =>
      fighters.map((f, i) => ({
        id: f.slug,
        art: f.art,
        el: slotEls[i] ?? null,
        // Pairs square up: even slots face right, odd slots face left.
        yaw: hovered === i ? 0 : i % 2 === 0 ? 0.55 : -0.55,
        forward: hovered === i ? 0.6 : 0,
        frame: hovered === i ? "red" : "gold",
      })),
    [fighters, slotEls, hovered],
  );

  const show3d = webgl === true && !failed;
  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => setFailed(true), []);

  return (
    <>
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
      <ul className="relative mx-auto grid max-w-6xl grid-cols-4 gap-x-3 gap-y-6 px-4 pt-6 pb-10 md:grid-cols-8">
        {fighters.map((fighter, i) => (
          <li
            key={fighter.slug}
            className="animate-rise-in"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <Link
              href={`/members/${fighter.slug}`}
              className="group block focus-visible:outline-2 focus-visible:outline-offset-4"
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
            >
              <div ref={slotRefs[i]} className="relative aspect-[3/4.4]">
                <SkewPortrait
                  src={fighter.art.portrait}
                  alt=""
                  sizes="140px"
                  className={cn(
                    "border-vs-gold absolute inset-0 transition-opacity duration-500",
                    show3d && ready && "opacity-0",
                  )}
                />
              </div>
              <p className="vs-title text-vs-cream group-hover:text-vs-gold mt-2 text-center text-2xl">
                {fighter.name}
              </p>
              <HpBar
                value={fighter.hp}
                variant={i % 2 === 0 ? "p1" : "p2"}
                label={`${fighter.name} win share`}
              />
              <p className="vs-label text-vs-cream/80 mt-1 text-center tracking-wider">
                {percent(fighter.winShare)}
                {fighter.winShare === null ? "" : " win share"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
