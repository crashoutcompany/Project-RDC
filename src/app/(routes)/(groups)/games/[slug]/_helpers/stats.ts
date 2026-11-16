import { StatName } from "@/lib/stat-names";
import {
  getWinsPerPlayer,
  getMatchesPerGame,
  StatEndsWith,
  getStatPerPlayer,
} from "prisma/lib/games";
import { QueryResponseData } from "prisma/db";
import { logNAN } from "@/posthog/server-analytics";

export const calcWinsPerPlayer = (
  game: QueryResponseData<Awaited<ReturnType<typeof getWinsPerPlayer>>>,
) => {
  const members = new Map<string, { matchWins: number; setWins: number }>();

  for (const session of game.sessions) {
    for (const set of session.sets) {
      // Calculate Match Wins
      for (const match of set.matches) {
        for (const winner of match.matchWinners) {
          const member = members.get(winner.playerName);
          if (!member)
            members.set(winner.playerName, { matchWins: 1, setWins: 0 });
          else member.matchWins += 1;
        }
      }
      // Calculate Set Wins
      for (const winner of set.setWinners) {
        const member = members.get(winner.playerName);
        if (!member)
          members.set(winner.playerName, { matchWins: 0, setWins: 1 });
        else member.setWins += 1;
      }
    }
  }
  const data = Array.from(members, ([key, val]) => ({
    player: key,
    matchWins: val.matchWins,
    setWins: val.setWins,
  }));
  return data;
};

type MembersPerPosition = {
  first: number;
  second: number;
  third: number;
  last: number;
} & FirstThroughEighth;

type FirstThroughEighth = {
  [K in 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8]?: number;
};
export const calcMostPerPlacing = async (
  gameId: number,
  statName: StatEndsWith<"POS">,
) => {
  const sessions = await getMatchesPerGame(gameId, statName);

  if (!sessions.success || !sessions.data) {
    console.log("Failed to get sessions");
    return [];
  }

  const members = new Map<string, MembersPerPosition>();

  for (const session of sessions.data) {
    for (const set of session.sets) {
      for (const match of set.matches) {
        const race = [];
        for (const ps of match.playerSessions) {
          // TODO Potentially unsafe if no stats found
          const pos = Number(ps.playerStats[0].value);
          if (isNaN(pos)) {
            logNAN("calcMostPerPlacing", ps.playerStats[0].playerStatId);
            continue;
          }
          if (!members.has(ps.player.playerName))
            members.set(ps.player.playerName, {
              first: 0,
              second: 0,
              third: 0,
              last: 0,
            });
          const member = members.get(ps.player.playerName)!;
          member[pos as keyof MembersPerPosition] ??= 0;
          member[pos as keyof MembersPerPosition] += 1;
          race.push({ player: ps.player.playerName, pos });
        }
        const sorted = race.toSorted((a, b) => a.pos - b.pos);
        const firstPlace = sorted[0].player;
        const secondPlace = sorted[1].player;
        const thirdPlace = sorted[2].player;
        const lastPlace = sorted[sorted.length - 1].player;

        let member = members.get(firstPlace)!;
        member.first += 1;

        member = members.get(secondPlace)!;
        member.second += 1;

        member = members.get(thirdPlace)!;
        member.third += 1;

        member = members.get(lastPlace)!;
        member.last += 1;
      }
    }
  }
  const data = Array.from(members, ([key, val]) => ({
    player: key,
    first: val.first,
    second: val.second,
    third: val.third,
    last: val.last,
    1: val[1] || 0,
    2: val[2] || 0,
    3: val[3] || 0,
    4: val[4] || 0,
    5: val[5] || 0,
    6: val[6] || 0,
    7: val[7] || 0,
    8: val[8] || 0,
  }));

  return data;
};

export const calcStatPerPlayer = async (gameId: number, statName: StatName) => {
  const stats = await getStatPerPlayer(gameId, statName);

  if (!stats.success || !stats.data) {
    console.log("Failed to get stats");
    return [];
  }
  const members = new Map<string, number>();

  for (const { player, value, statId } of stats.data) {
    const val = Number(value);

    if (isNaN(val)) {
      logNAN("calcStatPerPlayer", statId);
      continue;
    }

    const member = members.get(player.playerName) || 0;
    members.set(player.playerName, member + val);
  }
  const data = Array.from(members, ([key, val]) => ({ player: key, val }));

  return data;
};
