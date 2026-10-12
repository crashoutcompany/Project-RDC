import Image from "next/image";
import Link from "next/link";
import { GamesEnum } from "@/lib/constants";
import type { Arena } from "@/lib/rdc-stats";
import { cn } from "@/lib/utils";

/** Each arena's card colour; game art sits behind it, tinted. */
export const ARENA_COLORS: Record<GamesEnum, string> = {
  [GamesEnum.MarioKart8]: "bg-[#b3141f]",
  [GamesEnum.RocketLeague]: "bg-vs-blue",
  [GamesEnum.CallOfDuty]: "bg-[#2a2833]",
  [GamesEnum.LethalCompany]: "bg-[#1f6b35]",
  [GamesEnum.SpeedRunners]: "bg-[#b5560c]",
  [GamesEnum.MarvelRivals]: "bg-[#6a2bc0]",
};

export const ARENA_BAR: Record<GamesEnum, string> = {
  [GamesEnum.MarioKart8]: "bg-vs-red",
  [GamesEnum.RocketLeague]: "bg-vs-blue",
  [GamesEnum.CallOfDuty]: "bg-[#55525f]",
  [GamesEnum.LethalCompany]: "bg-[#2d9a4c]",
  [GamesEnum.SpeedRunners]: "bg-[#e0761a]",
  [GamesEnum.MarvelRivals]: "bg-[#8b46ea]",
};

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
      className={cn(
        "group relative block min-h-36 -skew-x-6 overflow-hidden border-2 border-transparent p-4 shadow-[6px_6px_0_#0d0b10] transition-transform hover:-translate-y-1 hover:border-vs-cream",
        ARENA_COLORS[arena.slug],
      )}
    >
      <Image
        src={arena.image}
        alt=""
        fill
        sizes="(max-width: 768px) 100vw, 33vw"
        className="object-cover opacity-30 mix-blend-luminosity transition-opacity duration-300 group-hover:opacity-40 motion-reduce:transition-none"
      />
      <div className="relative flex h-full skew-x-6 flex-col justify-between gap-6">
        <div className="vs-label text-vs-cream flex justify-between">
          <span>Arena {String(arena.index).padStart(2, "0")}</span>
          <span>Fight ▶</span>
        </div>
        <div>
          <h3 className="vs-title text-vs-cream text-4xl drop-shadow-[2px_2px_0_rgba(0,0,0,0.6)]">
            {arena.name}
          </h3>
          {showStats ? (
            <p className="vs-label text-vs-cream/90 mt-2 flex flex-wrap gap-x-4 gap-y-1 tracking-wider">
              <span>Sessions {arena.sessions || "—"}</span>
              <span>Last played {arena.lastPlayed ?? "—"}</span>
              <span>
                Champ{" "}
                {arena.champion ? (
                  <span className="text-vs-gold">{arena.champion.name}</span>
                ) : (
                  "???"
                )}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
