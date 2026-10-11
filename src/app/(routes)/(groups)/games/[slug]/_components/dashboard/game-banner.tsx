import Image from "next/image";
import type { DashboardBannerStats } from "../../_helpers/dashboard";

type GameBannerProps = {
  gameName: string;
  gameImage: string;
  stats: DashboardBannerStats;
};

export function GameBanner({ gameName, gameImage, stats }: GameBannerProps) {
  const hasData = stats.totalMatches > 0;
  return (
    <div className="border-vs-gold vs-shadow from-vs-ink relative overflow-hidden border-4 bg-linear-to-r via-[#1b2a6b] to-[#c2621b]">
      {gameImage ? (
        <Image
          src={gameImage}
          alt=""
          fill
          className="object-cover object-right opacity-45 [image-rendering:pixelated]"
          sizes="100vw"
          priority
        />
      ) : null}
      <div className="from-vs-ink via-vs-ink/70 absolute inset-0 bg-linear-to-r to-transparent" />
      <div className="relative px-6 pt-16 pb-6 sm:px-8">
        <h1 className="vs-title text-vs-cream text-5xl sm:text-6xl md:text-7xl">
          {gameName} <span className="text-vs-gold">Dashboard</span>
        </h1>
        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
          <BannerStat label="Total matches" value={hasData ? stats.totalMatches.toLocaleString() : "--"} />
          <BannerStat label="Total sets" value={hasData ? stats.totalSets.toLocaleString() : "--"} />
          <BannerStat label="Last played" value={stats.lastPlayed ?? "--"} />
        </dl>
      </div>
    </div>
  );
}

function BannerStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="vs-label text-vs-cream/70">{label}</dt>
      <dd className="vs-title text-vs-cream text-4xl not-italic">{value}</dd>
    </div>
  );
}
