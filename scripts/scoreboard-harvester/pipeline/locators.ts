import type { Player } from "@/generated/prisma/client";
import type { MatchManifest, OcrRecord } from "../types";
import { locateMarioKart, refineMarioKartReads, type LocateArgs } from "./mario-kart";

export type { LocateArgs };

/** A game whose scoreboard is not one yes/no question on the sampled frames. */
export interface GameLocator {
  locate(args: LocateArgs): Promise<OcrRecord[]>;
  refine(matches: MatchManifest[], players: Player[]): MatchManifest[];
}

const LOCATORS: Record<string, GameLocator> = {
  "mario-kart-8": { locate: locateMarioKart, refine: refineMarioKartReads },
};

export function locatorFor(gameSlug: string): GameLocator | undefined {
  return LOCATORS[gameSlug];
}
