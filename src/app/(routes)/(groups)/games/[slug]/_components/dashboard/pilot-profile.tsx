import Image from "next/image";
import { capitalizeFirst } from "@/lib/utils";
import type { MvpProfile } from "../../_helpers/dashboard";

type PilotProfileProps = {
  mvp: MvpProfile;
  gameName: string;
};

const RAILS = ["border-l-ac-gold", "border-l-ac-cream", "border-l-[#6b8cff]", "border-l-ac-red"];
const VALUE_COLORS = ["text-ac-gold", "text-ac-cream", "text-[#6b8cff]", "text-ac-red"];
const EMPTY_STATS = ["Matches won", "Sets won", "Days won", "MVPs"];

/** Most recent MVP for the game, or a "No MVP yet" card with empty stat slots. */
export function PilotProfile({ mvp, gameName }: PilotProfileProps) {
  const stats = mvp?.stats.length
    ? mvp.stats.slice(0, 4).map((s) => ({ label: capitalizeFirst(s.statName), value: String(s.sum) }))
    : EMPTY_STATS.map((label) => ({ label, value: "--" }));

  return (
    <div className="border-ac-gold ac-shadow bg-ac-ink flex h-full flex-col border-4 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="ac-label text-ac-cream/80">Player profile</p>
        <span className="ac-label bg-ac-red text-ac-cream px-2 py-0.5 tracking-wider">MVP</span>
      </div>
      <div className="mb-5 flex items-center gap-4">
        {mvp?.image ? (
          <div className="ac-skew relative h-24 w-20 shrink-0 overflow-hidden">
            <Image src={mvp.image} alt={mvp.playerName} fill sizes="40px" className="ac-pixel object-cover" />
          </div>
        ) : (
          <div className="ac-skew bg-ac-panel-2 ac-title text-ac-cream/40 grid h-24 w-20 shrink-0 place-items-center text-2xl">
            ?
          </div>
        )}
        <div className="min-w-0">
          <p className="ac-title text-ac-cream text-2xl">{mvp ? mvp.playerName : "No MVP yet"}</p>
          <p className="text-ac-cream/80 line-clamp-2 text-sm">
            {mvp?.description ?? `MVP data for ${gameName} will appear here once a session is logged.`}
          </p>
        </div>
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-3">
        {stats.map((stat, i) => (
          <div key={stat.label} className={`bg-ac-panel border-l-4 px-3 py-2 ${RAILS[i]}`}>
            <dt className="ac-label text-ac-cream/70 truncate">{stat.label}</dt>
            <dd className={`ac-title text-3xl ${VALUE_COLORS[i]}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
