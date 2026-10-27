import Link from "next/link";
import { Heading } from "@/components/arcade/ui";
import type { DayWinStreak, Prime } from "@/lib/streaks";
import { formatSessionDate } from "@/lib/utils";

export type GameStreakRow = {
  gameName: string;
  streak: DayWinStreak | null;
  prime: Prime | null;
};

/**
 * Per-game day-win streaks and prime windows for one member.
 *
 * @param rows - One row per game the member has day wins or sessions in.
 */
export function MemberStreaks({ rows }: { rows: GameStreakRow[] }) {
  return (
    <div>
      <Heading lead="Streaks & primes" className="text-ac-gold mb-6" />
      {rows.length === 0 ? (
        <p className="text-ac-cream/70">No streaks or primes yet.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.gameName}
              className="bg-ac-panel border-ac-panel-2 border-2 p-5"
            >
              <p className="ac-label text-ac-gold mb-4">{row.gameName}</p>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="ac-label text-ac-cream/80">Day-win streak</dt>
                  <dd className="text-ac-cream mt-1 tabular-nums">
                    {row.streak ? (
                      <>
                        <span className="ac-title text-3xl">
                          {row.streak.longest.length}
                        </span>{" "}
                        longest
                        <span className="text-ac-cream/60 block text-sm">
                          {formatSessionDate(row.streak.longest.from)} to{" "}
                          {formatSessionDate(row.streak.longest.to)}
                        </span>
                        <span className="text-ac-cream/70 block text-sm">
                          Current: {row.streak.current}
                        </span>
                      </>
                    ) : (
                      <span className="text-ac-cream/70">No day wins.</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="ac-label text-ac-cream/80">Prime</dt>
                  <dd className="text-ac-cream mt-1 tabular-nums">
                    {row.prime ? (
                      <>
                        <span className="ac-title text-ac-gold text-3xl">
                          {Math.round(row.prime.rate * 100)}%
                        </span>{" "}
                        win rate
                        <span className="block text-sm">
                          {row.prime.wins}/{row.prime.matches} matches over{" "}
                          {row.prime.sessions} sessions
                        </span>
                        <Link
                          href={`/sessions/${row.prime.from.sessionId}`}
                          className="ac-label text-ac-cream/80 hover:text-ac-gold mt-1 block text-sm"
                        >
                          ▶ From {formatSessionDate(row.prime.from.date)}
                        </Link>
                      </>
                    ) : (
                      <span className="text-ac-cream/70">
                        Needs 5 sessions.
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
