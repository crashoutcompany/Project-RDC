"use client";

import { useState } from "react";
import { GameBanner } from "./game-banner";
import { PilotProfile } from "./pilot-profile";
import { SquadLeaderboard } from "./squad-leaderboard";
import { ReplayLibrary } from "./replay-library";
import { ReplayViewer } from "./replay-viewer";
import { RecentMatches } from "./recent-matches";
import type { GameDashboardData, Sessions } from "../../_helpers/dashboard";

type GameDashboardProps = {
  data: GameDashboardData;
  children?: React.ReactNode;
};

/**
 * Client-side wrapper that composes the full game dashboard layout.
 * Manages the active session state for the replay viewer.
 * Accepts children for game-specific stat charts (rendered below the dashboard).
 *
 * @param props - Contains the assembled dashboard data and optional children for game-specific content.
 * @returns The complete game dashboard JSX element.
 */
export function GameDashboard({ data, children }: GameDashboardProps) {
  const [activeSession, setActiveSession] = useState<Sessions[0] | null>(null);

  /**
   * Handles session selection from the replay library.
   *
   * @param session - The selected session.
   */
  function handleSelectSession(session: Sessions[0]) {
    setActiveSession(session);
  }

  return (
    <div className="space-y-8">
      <GameBanner
        gameName={data.gameName}
        gameImage={data.gameImage}
        stats={data.bannerStats}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <PilotProfile mvp={data.mvpProfile} gameName={data.gameName} />
        <SquadLeaderboard
          leaderboard={data.leaderboard}
          gameName={data.gameName}
        />
      </div>

      <Rule />

      <ReplayLibrary
        sessions={data.sessions}
        onSelectSession={handleSelectSession}
      />

      <Rule />

      <ReplayViewer session={activeSession} />

      <Rule />

      <RecentMatches matches={data.recentMatches} gameName={data.gameName} />

      {children && (
        <>
          <Rule />
          <section>
            <div className="mb-4">
              <h2 className="ac-title text-ac-cream text-2xl">
                Stat <span className="text-ac-gold">board</span>
              </h2>
              <p className="text-ac-cream/70 text-sm">
                All-time numbers for every player
              </p>
            </div>
            {children}
          </section>
        </>
      )}
    </div>
  );
}

const Rule = () => <div className="bg-ac-gold h-1" />;
