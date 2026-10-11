import { cn } from "@/lib/utils";

const RANK_COLORS = ["#ffd400", "#c9c6e8", "#ff8a2d"];

/** Ranked rows with a gold/silver/bronze rail and a bar relative to 1st. */
export function Leaderboard({
  entries,
  placeholderRows = 5,
}: {
  entries: { player: string; wins: number }[];
  /** Rows of `???` shown when there is no data yet. */
  placeholderRows?: number;
}) {
  const lead = entries[0]?.wins ?? 0;
  const rows = entries.length
    ? entries
    : Array.from({ length: placeholderRows }, () => null);

  return (
    <ol className="space-y-2">
      {rows.map((entry, i) => (
        <li
          key={entry?.player ?? i}
          className="bg-black border-l-ac-panel-2 flex items-center gap-4 border-l-4 px-4 py-2"
          style={i < 3 ? { borderLeftColor: RANK_COLORS[i] } : undefined}
        >
          <span
            className={cn(
              "ac-title grid size-7 shrink-0 place-items-center text-xs",
              i < 3 ? "text-ac-ink" : "bg-ac-panel-2 text-ac-cream",
            )}
            style={i < 3 ? { background: RANK_COLORS[i] } : undefined}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="ac-label text-ac-cream truncate">
              {entry?.player ?? "???"}
            </p>
            <div className="bg-ac-panel-2 mt-1 h-1.5">
              <div
                className="h-full bg-[#5a55a8] [mask-image:repeating-linear-gradient(90deg,#000_0_5px,transparent_5px_7px)]"
                style={{
                  width: entry && lead ? `${(entry.wins / lead) * 100}%` : 0,
                  background: i < 3 ? RANK_COLORS[i] : undefined,
                }}
              />
            </div>
          </div>
          <span
            className={cn(
              "text-3xl tabular-nums",
              i === 0 && entry ? "text-ac-gold" : "text-ac-cream",
            )}
          >
            {entry?.wins ?? "--"}
            <span className="text-ac-cream/60 ml-1 text-lg">W</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
