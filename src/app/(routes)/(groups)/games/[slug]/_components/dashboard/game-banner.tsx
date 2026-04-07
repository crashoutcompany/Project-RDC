import Image from "next/image";
import type { DashboardBannerStats } from "../../_helpers/dashboard";

type GameBannerProps = {
  gameName: string;
  gameImage: string;
  stats: DashboardBannerStats;
};

/**
 * Renders the hero banner for a game dashboard with the game image
 * and overlay stats (total matches, total sets, last played).
 *
 * @param props - Contains gameName, gameImage path, and banner stats.
 * @returns The game banner JSX element.
 */
export function GameBanner({ gameName, gameImage, stats }: GameBannerProps) {
  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl sm:h-64 md:h-72">
      <Image
        src={gameImage}
        alt={gameName}
        fill
        className="object-cover"
        sizes="100vw"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8">
        <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
          {gameName.toUpperCase()}{" "}
          <span className="text-chart-1 font-black">DASHBOARD</span>
        </h1>
        <div className="flex flex-wrap gap-6 text-white sm:gap-10">
          <BannerStat label="Total Matches" value={stats.totalMatches.toLocaleString()} />
          <BannerStat label="Total Sets" value={stats.totalSets.toLocaleString()} />
          {stats.lastPlayed && (
            <BannerStat label="Last Played" value={stats.lastPlayed} />
          )}
        </div>
      </div>
    </div>
  );
}

function BannerStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-white/70">
        {label}
      </p>
      <p className="text-xl font-bold sm:text-2xl">{value}</p>
    </div>
  );
}
