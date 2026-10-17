import Image from "next/image";
import type { FighterSprite } from "@/lib/fighters";
import { cn } from "@/lib/utils";

/**
 * Fighting-game idle for a flat 2D sprite, done as a two-part CSS rig: the
 * same image is drawn twice, legs clipped below the waist and kept planted,
 * torso masked above it and bobbing/breathing from a waist pivot. The torso's
 * mask fades over the legs so the cut never shows. Fills its box, feet at the
 * bottom; `flip` turns a right-facing sprite to face left (2P side).
 */
export function IdleSprite({
  sprite,
  alt,
  flip = false,
  delay,
  priority,
  className,
}: {
  sprite: FighterSprite;
  alt: string;
  flip?: boolean;
  /** Offsets the loop so two fighters on screen don't bob in sync. */
  delay?: string;
  priority?: boolean;
  className?: string;
}) {
  const image = {
    src: sprite.src,
    width: sprite.width,
    height: sprite.height,
    sizes: "(min-width: 1024px) 320px, 45vw",
    priority,
  };
  return (
    <div
      className={cn("flex items-end justify-center", className)}
      style={
        {
          "--waist": `${sprite.waist * 100}%`,
          "--idle-delay": delay,
        } as React.CSSProperties
      }
    >
      <div className={cn("relative h-full", flip && "-scale-x-100")}>
        <span aria-hidden className="ac-idle-shadow" />
        <Image
          {...image}
          alt=""
          aria-hidden
          className="ac-idle-legs block h-full w-auto"
        />
        <Image
          {...image}
          alt={alt}
          className="ac-idle-torso absolute inset-0 h-full w-auto"
        />
      </div>
    </div>
  );
}
