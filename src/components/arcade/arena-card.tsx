import Image from "next/image";
import Link from "next/link";
import { GamesEnum } from "@/lib/constants";
import type { Arena } from "@/lib/rdc-stats";
import { cn } from "@/lib/utils";

/** Neon accent per stage, used for the stage number and table rails. */
export const ARENA_TEXT: Record<GamesEnum, string> = {
  [GamesEnum.MarioKart8]: "text-ac-red",
  [GamesEnum.RocketLeague]: "text-ac-blue",
  [GamesEnum.CallOfDuty]: "text-ac-pink",
  [GamesEnum.LethalCompany]: "text-ac-green",
  [GamesEnum.SpeedRunners]: "text-ac-gold",
  [GamesEnum.MarvelRivals]: "text-[#b07bff]",
};

export const ARENA_BAR: Record<GamesEnum, string> = {
  [GamesEnum.MarioKart8]: "bg-ac-red",
  [GamesEnum.RocketLeague]: "bg-ac-blue",
  [GamesEnum.CallOfDuty]: "bg-ac-pink",
  [GamesEnum.LethalCompany]: "bg-ac-green",
  [GamesEnum.SpeedRunners]: "bg-ac-gold",
  [GamesEnum.MarvelRivals]: "bg-[#b07bff]",
};

/** Arcade cabinet panel for a game; pixelated game art glows through on hover. */
export function ArenaCard({
  arena,
  showStats = false,
}: {
  arena: Arena;
  showStats?: boolean;
}) {
  return (
    <Link
      href={`/games/${arena.slug}`}
      className="group border-ac-panel-2 bg-ac-panel hover:border-ac-gold relative block min-h-36 overflow-hidden border-2 p-4 transition-colors"
    >
      <Image
        src={arena.image}
        alt=""
        fill
        sizes="64px"
        quality={60}
        className="ac-pixel object-cover opacity-15 transition-opacity duration-200 group-hover:opacity-40 motion-reduce:transition-none"
      />
      <div className="relative flex h-full flex-col justify-between gap-6">
        <span className={cn("ac-label", ARENA_TEXT[arena.slug])}>
          Stage {String(arena.index).padStart(2, "0")}
        </span>
        <div>
          <h3 className="ac-title text-ac-cream text-sm md:text-base">
            {arena.name}
          </h3>
          {showStats ? (
            <p className="text-ac-cream/80 mt-2 flex flex-wrap gap-x-4 text-lg">
              <span>Sessions {arena.sessions || "--"}</span>
              <span>Last played {arena.lastPlayed ?? "--"}</span>
              <span>
                Champ{" "}
                <span className="text-ac-gold capitalize">
                  {arena.champion ?? "???"}
                </span>
              </span>
            </p>
          ) : null}
        </div>
        <span className="ac-label text-ac-gold">▶ Enter</span>
      </div>
    </Link>
  );
}
