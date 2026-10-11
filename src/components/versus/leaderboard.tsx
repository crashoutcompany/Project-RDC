import { cn } from "@/lib/utils";

const RANK_COLORS = ["#ffc21a", "#c9c6d1", "#d0782b"];

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
          className="bg-vs-ink border-l-vs-panel-2 flex items-center gap-4 border-l-4 px-4 py-2"
          style={i < 3 ? { borderLeftColor: RANK_COLORS[i] } : undefined}
        >
          <span
            className={cn(
              "vs-title grid size-8 shrink-0 place-items-center pt-1 text-2xl not-italic",
              i < 3 ? "text-vs-ink" : "bg-vs-panel-2 text-vs-cream",
            )}
            style={i < 3 ? { background: RANK_COLORS[i] } : undefined}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="vs-title text-vs-cream truncate text-2xl not-italic capitalize">
              {entry?.player ?? "???"}
            </p>
            <div className="bg-vs-panel-2 h-1.5">
              <div
                className="h-full bg-[#55525f]"
                style={{
                  width: entry && lead ? `${(entry.wins / lead) * 100}%` : 0,
                  background: i < 3 ? RANK_COLORS[i] : undefined,
                }}
              />
            </div>
          </div>
          <span
            className={cn(
              "vs-title text-3xl tabular-nums",
              i === 0 && entry ? "text-vs-gold" : "text-vs-cream",
            )}
          >
            {entry?.wins ?? "--"}
            <span className="text-vs-cream/60 ml-1 text-lg">W</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
