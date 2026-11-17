import type { Player } from "@/generated/prisma/client";
import type {
  AnalysisResults,
  AnalyzedPlayer,
  AnalyzedPlayersObj,
  AnalyzedTeamData,
  VisionPlayer,
} from "@/lib/visionTypes";
import { VisionResultCodes } from "../constants";
import type { StatName } from "../stat-names";
import { processPlayer, validateProcessedPlayer } from "./game-processor-utils";
import type { GameProcessorSpec, WinnerRule } from "./game-specs";

/** Per-player fields in Azure's layout: one array per team, or a single array for solo games. */
export type ScoreboardFields = AnalyzedTeamData[] | AnalyzedPlayersObj[];

type Read = { players: VisionPlayer[]; needsReview: boolean };

const isTeamData = (fields: ScoreboardFields): fields is AnalyzedTeamData[] =>
  (fields as AnalyzedTeamData[])[0]?.teamName !== undefined;

function readRows(
  spec: GameProcessorSpec,
  rows: AnalyzedPlayer[],
  sessionPlayers: Player[],
  teamName?: string,
): Read {
  const statPrefix =
    spec.input.layout === "teams" ? spec.input.statPrefix : undefined;
  const read: Read = { players: [], needsReview: false };

  for (const row of rows) {
    // A stat that was missing, unreadable or out of range.
    const processed = processPlayer(row, teamName, statPrefix);
    if (processed.reqCheckFlag) read.needsReview = true;

    // A row that isn't one of the session's players is dropped, and flagged
    // so the admin can confirm nobody was left out.
    const player = validateProcessedPlayer(processed, sessionPlayers);
    if (player) read.players.push(player);
    else read.needsReview = true;
  }
  return read;
}

/**
 * The one place the reader's output is checked against the shape the game
 * expects. Data in the other layout yields no players and a review request.
 */
function readPlayers(
  spec: GameProcessorSpec,
  fields: ScoreboardFields,
  sessionPlayers: Player[],
): Read {
  const wrongLayout: Read = { players: [], needsReview: true };

  if (spec.input.layout === "teams") {
    if (!isTeamData(fields)) return wrongLayout;

    const read: Read = { players: [], needsReview: false };
    for (const team of fields) {
      if (!spec.input.teams.includes(team.teamName)) continue;
      try {
        const rows = team.players.valueArray ?? [];
        const teamRead = readRows(spec, rows, sessionPlayers, team.teamName);
        read.players.push(...teamRead.players);
        read.needsReview ||= teamRead.needsReview;
      } catch (error) {
        // A malformed team loses its rows; the rest of the match still imports.
        console.error(`Error processing team ${team.teamName}:`, error);
        read.needsReview = true;
      }
    }
    return read;
  }

  if (isTeamData(fields)) return wrongLayout;

  const rows = fields[0]?.valueArray;
  if (!rows?.length && spec.reviewEmptyRead)
    return { players: [], needsReview: true };
  if (!rows)
    throw new Error(`No player rows in the ${spec.name} scoreboard read`);
  return readRows(spec, rows, sessionPlayers);
}

const statOf = (player: VisionPlayer, stat: StatName) =>
  Number(player.stats.find((s) => s.stat === stat)?.statValue);

type Winners = {
  winners: VisionPlayer[];
  /** The reader's winner label and the stats point at different teams. */
  disputed: boolean;
};

function pickWinners(
  rule: WinnerRule,
  players: VisionPlayer[],
  labelledTeam?: string,
): Winners {
  if (rule.by === "team-total") {
    const teams = new Map<string, { players: VisionPlayer[]; total: number }>();
    for (const player of players) {
      if (!player.teamKey) continue;
      const team = teams.get(player.teamKey) ?? { players: [], total: 0 };
      team.players.push(player);
      team.total += statOf(player, rule.stat) || 0;
      teams.set(player.teamKey, team);
    }

    const [first, ...rest] = teams.values();
    // Without a single recognised player there is no match to import; failing
    // lets the reader chain fall back to the next reader.
    if (!first) throw new Error("No session players were found on either team");
    // The team listed first keeps a tie.
    const byTotal = rest.reduce(
      (best, team) => (team.total > best.total ? team : best),
      first,
    );
    if (!labelledTeam) return { winners: byTotal.players, disputed: false };

    // What the screen says beats arithmetic on stats that may be misread. A
    // labelled team with none of the session's players means nobody here won.
    const labelled = teams.get(labelledTeam);
    return { winners: labelled?.players ?? [], disputed: labelled !== byTotal };
  }

  if (players.length === 0) return { winners: [], disputed: false };
  const beats = (value: number, best: number) =>
    rule.by === "lowest" ? value < best : value > best;
  // The first row keeps a tie (and wins if its own value is unreadable).
  const winner = players.reduce((winner, player) =>
    beats(statOf(player, rule.stat), statOf(winner, rule.stat))
      ? player
      : winner,
  );
  return { winners: [winner], disputed: false };
}

/** The team the reader saw marked as the winner, when it marked exactly one. */
const labelledWinner = (fields: ScoreboardFields) => {
  if (!isTeamData(fields)) return undefined;
  const marked = fields.filter((team) => team.winner);
  return marked.length === 1 ? marked[0].teamName : undefined;
};

/**
 * Runs a game's spec over a scoreboard read (from any reader): maps rows to
 * session players, validates stats, applies the game's OCR corrections when
 * asked, and picks winners.
 */
export function processGameScoreboard(
  spec: GameProcessorSpec,
  args: {
    fields: ScoreboardFields;
    sessionPlayers: Player[];
    ocrCorrections: boolean;
  },
): AnalysisResults {
  const { fields, sessionPlayers, ocrCorrections } = args;
  const read = readPlayers(spec, fields, sessionPlayers);
  let players = spec.finalize ? spec.finalize(read.players) : read.players;
  let needsReview = read.needsReview;

  const { correctStat } = spec;
  if (ocrCorrections && correctStat)
    players = players.map((player) => ({
      ...player,
      stats: player.stats.map((stat) => {
        const corrected = correctStat(stat.statValue, sessionPlayers.length);
        needsReview ||= corrected.reqCheck;
        return { ...stat, statValue: corrected.statValue };
      }),
    }));

  const { winners, disputed } = pickWinners(
    spec.winner,
    players,
    labelledWinner(fields),
  );
  const data = { players, winner: winners };
  return needsReview || disputed
    ? {
        status: VisionResultCodes.CheckRequest,
        data,
        message:
          "There was some trouble processing some stats. They have been assigned the most probable value but please check to ensure all stats are correct before submitting.",
      }
    : {
        status: VisionResultCodes.Success,
        data,
        message: "Results have been successfully imported.",
      };
}
