import PlayerAvatar from "@/app/(routes)/admin/_components/form/PlayerAvatar";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";
import { Session } from "../[slug]/page";
import { FormValues } from "@/app/(routes)/admin/_utils/form-helpers";
import { ProposedData } from "@/app/actions/editSession";
import { Separator } from "@/components/ui/separator";
import { Player } from "@/generated/prisma/client";

type ProposedChange = {
  player: string;
  statName: string;
  oldValue: string;
  newValue: string;
};

function formatChanges(
  oldMatch: Session["sets"][number]["matches"][number],
  newMatch: FormValues["sets"][number]["matches"][number],
): { player: string; changes: ProposedChange[] }[] {
  const grouped = new Map<string, ProposedChange[]>();

  oldMatch.playerSessions.forEach((oldPS, psIdx) => {
    const newPS = newMatch.playerSessions[psIdx];
    if (!newPS) return;
    oldPS.playerStats.forEach((oldStat) => {
      const newStat = newPS.playerStats.find(
        (stat) => Number(stat.statId) === Number(oldStat.statId),
      );
      if (newStat && newStat.statValue !== oldStat.value) {
        const change: ProposedChange = {
          player: newPS.playerSessionName,
          statName: oldStat.gameStat.statName,
          oldValue: oldStat.value,
          newValue: newStat.statValue,
        };
        const key = newPS.playerSessionName;
        const arr = grouped.get(key) ?? [];
        arr.push(change);
        grouped.set(key, arr);
      }
    });
  });

  return Array.from(grouped.entries()).map(([player, changes]) => ({
    player,
    changes,
  }));
}

export const SessionChangesWrapper = ({
  set,
  json,
  setIndex,
}: {
  set: Session["sets"][number];
  json: ProposedData;
  setIndex: number;
}) => {
  const newSet = json.proposedData.sets[setIndex];
  let isNewSetWinners = false;

  for (const winner of set.setWinners) {
    const newWinner = newSet.setWinners.find(
      (nw) => nw.playerId === winner.playerId,
    );
    if (!newWinner) {
      isNewSetWinners = true;
      break;
    }
  }
  return (
    <>
      {/* TODO Set winners not working bc json  */}
      {isNewSetWinners && (
        <div className="my-3 flex flex-wrap items-center">
          <div className="text-red-500">Set winners have changed</div>
          {set.setWinners.map((winner) => (
            <PlayerAndName
              key={winner.playerId}
              winner={winner}
              newWinner={false}
            />
          ))}
          {newSet.setWinners.map((winner) => (
            <PlayerAndName
              key={winner.playerId}
              winner={winner}
              newWinner={true}
            />
          ))}
        </div>
      )}
      {set.matches.map((match, matchIdx) => {
        const newMatch = newSet.matches[matchIdx];
        if (!newMatch) return null;
        const players = formatChanges(match, newMatch);
        if (players.length === 0) return null;

        let isNewMatchWinners = false;
        for (const winner of match.matchWinners) {
          const newWinner = newSet.matches[matchIdx].matchWinners.find(
            (nw) => nw.playerId === winner.playerId,
          );
          if (!newWinner) {
            isNewMatchWinners = true;
            break;
          }
        }

        return (
          <div key={matchIdx} className="mb-4">
            <div className="text-muted-foreground mb-2 text-sm">
              Set {setIndex + 1}, Match {matchIdx + 1}
            </div>
            {isNewMatchWinners && (
              <div className="my-3 flex flex-wrap items-center">
                <div className="text-red-500">Match winners have changed</div>
                {match.matchWinners.map((winner) => (
                  <PlayerAndName
                    key={winner.playerId}
                    winner={winner}
                    newWinner={false}
                  />
                ))}
                {newMatch.matchWinners.map((winner) => (
                  <PlayerAndName
                    key={winner.playerId}
                    winner={winner}
                    newWinner={true}
                  />
                ))}
              </div>
            )}
            <Separator />
            <Changes players={players} />
          </div>
        );
      })}
    </>
  );
};

export const Changes = ({
  players,
}: {
  players: ReturnType<typeof formatChanges>;
}) => {
  return (
    <>
      {players.map((p, idx) => {
        const player = findPlayer(p.player);
        if (!player) return null;
        return (
          <div key={idx} className="flex items-center gap-4 pl-4">
            <PlayerAvatar player={player} />
            {p.changes.map((change) => {
              return (
                <div className="space-x-2" key={change.statName}>
                  <span className="text-sm font-medium">
                    {change.statName}:
                  </span>
                  <span className="text-red-500 line-through">
                    {change.oldValue}
                  </span>
                  <span className="text-green-500">{change.newValue}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
};

const PlayerAndName = ({
  winner,
  newWinner,
}: {
  winner: Player;
  newWinner: boolean;
}) => {
  return (
    <div key={winner.playerId} className="flex items-center gap-4 pl-4">
      <PlayerAvatar player={findPlayer(winner.playerName)!} />
      <span
        className={`text-sm font-medium ${newWinner ? "text-green-500" : "text-red-500"}`}
      >
        {winner.playerName}
      </span>
    </div>
  );
};
