import Image from "next/image";
import { Tag } from "@/components/arcade/ui";
import type { DashboardBannerStats } from "../../_helpers/dashboard";

const BANNER_TAGS: Record<string, string> = {
  "Mario Kart 8": "full send!!",
  "Rocket League": "boost!!",
  "Call of Duty": "no scope!!",
  "Lethal Company": "quota!!",
  SpeedRunners: "gotta go!!",
  "Marvel Rivals": "ult ready!!",
};

type GameBannerProps = {
  gameName: string;
  gameImage: string;
  stats: DashboardBannerStats;
};

export function GameBanner({ gameName, gameImage, stats }: GameBannerProps) {
  const hasData = stats.totalMatches > 0;
  return (
    <div className="border-ac-gold from-ac-ink relative overflow-hidden border-4 bg-linear-to-r via-[#14205a] to-[#c2621b]">
      {gameImage ? (
        <Image
          src={gameImage}
          alt=""
          fill
          className="ac-pixel object-cover object-right opacity-45"
          sizes="160px"
          priority
        />
      ) : null}
      <div className="from-ac-ink via-ac-ink/70 absolute inset-0 bg-linear-to-r to-transparent" />
      <Tag tone="green" className="absolute top-5 right-6 z-10">
        {BANNER_TAGS[gameName] ?? "game on!!"}
      </Tag>
      <div className="relative px-6 pt-16 pb-6 sm:px-8">
        <h1 className="ac-title text-ac-cream text-2xl sm:text-3xl md:text-4xl">
          {gameName} <span className="text-ac-gold">Dashboard</span>
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
      <dt className="ac-label text-ac-cream/70">{label}</dt>
      <dd className="text-ac-cream text-4xl">{value}</dd>
    </div>
  );
}
