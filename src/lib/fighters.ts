import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";

/**
 * What a member looks like as a fighter. Today every member is a `portrait`
 * (their real photo). Drop a rigged `.glb` into `public/fighters/` and add an
 * override below to swap a member to a 3D `model`; the portrait stays as the
 * flat / no-WebGL fallback.
 */
export type FighterArt =
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
    };

const FIGHTER_ART_OVERRIDES: Partial<Record<string, FighterArt>> = {
  // ben: { kind: "model", portrait: "/images/ben_rdc.jpg", model: "/fighters/ben.glb", idleClip: "Idle" },
};

export function getFighterArt(playerName: string): FighterArt {
  const override = FIGHTER_ART_OVERRIDES[playerName.toLowerCase()];
  if (override) return override;
  return {
    kind: "portrait",
    portrait: findPlayer(playerName)?.image ?? "/images/mark_rdc.jpg",
  };
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
