import Link from "next/link";
import { Heading } from "@/components/arcade/ui";
import { formatSessionDate } from "@/lib/utils";
import { dayWinStreaks, gameRecords, type RecordSession } from "@/lib/streaks";

/**
 * Day-win streak holders and best single-session records for one game.
 * Server-rendered from the approved sessions the game page already loads.
 */
export function GameRecords({ sessions }: { sessions: RecordSession[] }) {
  const streaks = dayWinStreaks(sessions);
  const longest = streaks[0];
  const current = streaks
    .filter((s) => s.current > 0)
    .sort((a, b) => b.current - a.current)[0];
  const records = gameRecords(sessions);

  return (
    <section data-testid="game-records">
      <Heading lead="Records" accent="& streaks" className="mb-6" />
      {sessions.length === 0 ? (
        <p className="text-ac-cream/70">No approved sessions yet.</p>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="bg-ac-panel border-ac-gold border-2 p-4">
              <dt className="ac-label text-ac-cream/80">
                Longest day-win streak
              </dt>
              <dd className="mt-1">
                {longest ? (
                  <>
                    <span className="ac-title text-ac-gold text-3xl tabular-nums">
                      {longest.longest.length}
                    </span>{" "}
                    <span className="text-ac-cream">{longest.player}</span>
                    <span className="text-ac-cream/60 block text-sm">
                      {formatSessionDate(longest.longest.from)} to{" "}
                      {formatSessionDate(longest.longest.to)}
                    </span>
                  </>
                ) : (
                  <span className="text-ac-cream/70">
                    No day winners recorded yet.
                  </span>
                )}
              </dd>
            </div>
            <div className="bg-ac-panel border-ac-red border-2 p-4">
              <dt className="ac-label text-ac-cream/80">
                Active day-win streak
              </dt>
              <dd className="mt-1">
                {current ? (
                  <>
                    <span className="ac-title text-ac-red text-3xl tabular-nums">
                      {current.current}
                    </span>{" "}
                    <span className="text-ac-cream">{current.player}</span>
                  </>
                ) : (
                  <span className="text-ac-cream/70">No active streak.</span>
                )}
              </dd>
            </div>
          </dl>

          {records.length === 0 ? (
            <p className="text-ac-cream/70 mt-8">No session records yet.</p>
          ) : (
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[480px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="ac-label text-ac-cream/70 text-left">
                    <th className="px-4 font-bold">Record</th>
                    <th className="px-4 font-bold">Holder</th>
                    <th className="px-4 text-right font-bold">Value</th>
                    <th className="px-4 font-bold">Session</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.statName} className="bg-ac-ink">
                      <td className="ac-label text-ac-cream px-4 py-3">
                        {r.label}
                        {r.kind === "average" ? " (avg)" : ""}
                      </td>
                      <td className="text-ac-cream px-4">{r.player}</td>
                      <td className="text-ac-gold px-4 text-right text-xl tabular-nums">
                        {r.kind === "average"
                          ? r.value.toFixed(1)
                          : Math.round(r.value)}
                      </td>
                      <td className="px-4">
                        <Link
                          href={`/sessions/${r.sessionId}`}
                          className="ac-label text-ac-cream hover:text-ac-gold"
                        >
                          ▶ {r.sessionName}
                        </Link>
                        <span className="text-ac-cream/60 ml-3 text-sm">
                          {formatSessionDate(r.date)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
