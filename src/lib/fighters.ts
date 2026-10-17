import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";

/**
 * What a member looks like as a fighter. Today every member is a `portrait`
 * (their real photo). Drop a rigged `.glb` into `public/fighters/` and add an
 * override below to swap a member to a 3D `model`; the portrait stays as the
 * flat / no-WebGL fallback.
 */
export type FighterArt = (
  | { kind: "portrait"; portrait: string }
  | {
      kind: "model";
      portrait: string;
      /** URL of a rigged glTF/GLB, e.g. `/fighters/ben.glb`. */
      model: string;
      /** Animation clip played on loop. Defaults to the first clip. */
      idleClip?: string;
      /** Uniform scale so the model stands ~2 world units tall. */
      scale?: number;
    }
) & {
  /** Full-body 2D character; fighter cards animate it, avatars keep `portrait`. */
  sprite?: FighterSprite;
};

/** Transparent, right-facing 2D sprite in `public/fighters/`. */
export type FighterSprite = {
  src: string;
  width: number;
  height: number;
  /**
   * Waist line as a fraction of the height. The idle loop keeps everything
   * below it planted and bobs the torso and head above it.
   */
  waist: number;
};

const FIGHTER_ART_OVERRIDES: Partial<Record<string, FighterArt>> = {
  // ben: { kind: "model", portrait: "/images/ben_rdc.jpg", model: "/fighters/ben.glb", idleClip: "Idle" },
};

/** 2D character sprites in `public/fighters/`, keyed by roster slug. */
const FIGHTER_SPRITES: Partial<Record<string, FighterSprite>> = {
  dylan: { src: "/fighters/dylan.png", width: 562, height: 880, waist: 0.56 },
  ben: { src: "/fighters/ben.png", width: 562, height: 926, waist: 0.54 },
  lee: { src: "/fighters/lee.png", width: 690, height: 948, waist: 0.5 },
  des: { src: "/fighters/des.png", width: 564, height: 790, waist: 0.52 },
  aff: { src: "/fighters/aff.png", width: 536, height: 938, waist: 0.53 },
  ipi: { src: "/fighters/ipi.png", width: 586, height: 822, waist: 0.48 },
  mark: { src: "/fighters/mark.png", width: 638, height: 906, waist: 0.5 },
};

export function getFighterArt(playerName: string): FighterArt {
  const slug = playerName.toLowerCase();
  const art: FighterArt = FIGHTER_ART_OVERRIDES[slug] ?? {
    kind: "portrait",
    portrait: findPlayer(playerName)?.image ?? "/images/mark_rdc.jpg",
  };
  const sprite = FIGHTER_SPRITES[slug];
  return sprite ? { ...art, sprite } : art;
}

/** Display order of the roster across the site. */
export const ROSTER_ORDER = [
  "dylan",
  "ben",
  "lee",
  "des",
  "john",
  "aff",
  "ipi",
  "mark",
];
