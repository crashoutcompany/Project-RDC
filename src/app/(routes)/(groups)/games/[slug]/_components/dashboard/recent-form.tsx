import Link from "next/link";
import { formatSessionDate } from "@/lib/utils";
import {
  RECENT_FORM_SESSIONS,
  type RecentForm,
} from "../../_helpers/stats";

/**
 * Compact strip of the crew's last sessions on this game: each tile is one
 * session and who won the day, followed by days won over that stretch.
 */
export function RecentFormStrip({ form }: { form: RecentForm }) {
  return (
    <section data-testid="recent-form-strip" aria-labelledby="recent-form-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="recent-form-title" className="ac-title text-ac-cream text-2xl">
          Recent <span className="text-ac-gold">form</span>
        </h2>
        <p className="text-ac-cream/70 text-sm">
          Last {RECENT_FORM_SESSIONS} sessions &middot; who won the day
        </p>
      </div>

      {form.sessions.length === 0 ? (
        <p className="text-ac-cream/70 text-sm">No sessions yet.</p>
      ) : (
        <>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {form.sessions.map((session) => (
              <li key={session.sessionId} data-testid="recent-form-session">
                <Link
                  href={`/sessions/${session.sessionId}`}
                  className="border-ac-panel-2 hover:border-ac-gold block h-full border-2 p-3 transition-colors"
                >
                  <p className="text-ac-cream/60 text-xs">
                    {formatSessionDate(session.date)}
                  </p>
                  <p className="text-ac-gold mt-1 truncate text-sm font-semibold">
                    {session.dayWinners.length
                      ? session.dayWinners.join(" & ")
                      : "No day winner"}
                  </p>
                  <p className="text-ac-cream/70 mt-1 truncate text-xs">
                    {session.sessionName}
                  </p>
                </Link>
              </li>
            ))}
          </ol>
          {form.daysWon.length > 0 && (
            <p className="text-ac-cream/80 mt-3 text-sm" data-testid="recent-form-days-won">
              <span className="text-ac-cream/60">Days won: </span>
              {form.daysWon
                .map(({ player, days }) => `${player} ${days}`)
                .join(" · ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
