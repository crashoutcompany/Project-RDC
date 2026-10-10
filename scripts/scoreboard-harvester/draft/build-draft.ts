import { VisionResultCodes } from "@/lib/constants";
import type { VisionPlayer } from "@/lib/visionTypes";
import type { SetRule } from "../games/types";
import type { MatchManifest } from "../types";

export interface DraftPlayer {
  playerId: number;
  name: string;
  teamKey?: string;
  stats: { stat: string; statValue: string }[];
}

export interface DraftMatch {
  /** 1-based scoreboard number from the harvester manifest. */
  match: number;
  timestampSec: number;
  imagePath: string;
  players: DraftPlayer[];
  winnerIds: number[];
  /** Azure or the processor flagged at least one stat as a guess. */
  needsReview: boolean;
}

export interface DraftSet {
  matches: DraftMatch[];
  winnerIds: number[];
}

export interface DraftSession {
  sets: DraftSet[];
  /** Scoreboards that were detected but left out, with the reason. */
  skipped: { match: number; timestampSec: number; reason: string }[];
  /** Anything an admin should double-check before approving. */
  warnings: string[];
}

/**
 * Turns analyzed scoreboards into the session → set → match shape the admin
 * form produces, so the harvester can save it as an unapproved draft.
 *
 * Matches stay in video order. A scoreboard is skipped when analysis failed,
 * fewer than `minPlayers` RDC members were recognized (randoms-only lobbies,
 * misreads), or it repeats the previous scoreboard's numbers exactly (the
 * same end screen detected twice, e.g. around a replay).
 */
export function buildDraft(args: {
  matches: MatchManifest[];
  setRule?: SetRule;
  minPlayers?: number;
}): DraftSession {
  const { matches, setRule = { kind: "single" }, minPlayers = 2 } = args;
  const skipped: DraftSession["skipped"] = [];
  const warnings: string[] = [];
  const kept: DraftMatch[] = [];

  for (const match of [...matches].sort(
    (a, b) => a.timestampSec - b.timestampSec,
  )) {
    const skip = (reason: string) =>
      skipped.push({ match: match.match, timestampSec: match.timestampSec, reason });
    const analysis = match.analysis;

    if (!analysis) {
      skip("not analyzed");
      continue;
    }
    if (analysis.status === VisionResultCodes.Failed) {
      skip(`analysis failed: ${analysis.message}`);
      continue;
    }

    const players = analysis.data.players
      .filter((p): p is VisionPlayer & { playerId: number } =>
        typeof p.playerId === "number",
      )
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        teamKey: p.teamKey,
        stats: p.stats.map(({ stat, statValue }) => ({ stat, statValue })),
      }));

    if (players.length < minPlayers) {
      skip(`only ${players.length} RDC player(s) recognized`);
      continue;
    }

    const previous = kept.at(-1);
    if (previous && statFingerprint(previous.players) === statFingerprint(players)) {
      skip(`duplicate of scoreboard ${previous.match}`);
      continue;
    }

    const winnerIds = (analysis.data.winner ?? [])
      .map((p) => p.playerId)
      .filter((id): id is number => typeof id === "number");

    kept.push({
      match: match.match,
      timestampSec: match.timestampSec,
      imagePath: match.imagePath,
      players,
      winnerIds,
      needsReview: analysis.status === VisionResultCodes.CheckRequest,
    });
  }

  for (const match of kept) {
    if (match.needsReview)
      warnings.push(`Scoreboard ${match.match}: some stats were low-confidence guesses.`);
    if (match.winnerIds.length === 0)
      warnings.push(`Scoreboard ${match.match}: no winner could be determined.`);
  }

  const sets = groupIntoSets(kept, setRule, warnings);
  return { sets, skipped, warnings };
}

function groupIntoSets(
  matches: DraftMatch[],
  rule: SetRule,
  warnings: string[],
): DraftSet[] {
  if (matches.length === 0) return [];

  if (rule.kind === "single")
    return [{ matches, winnerIds: mostMatchWins(matches) }];

  if (rule.kind === "fixed") {
    const sets: DraftSet[] = [];
    for (let i = 0; i < matches.length; i += rule.size) {
      const chunk = matches.slice(i, i + rule.size);
      if (chunk.length < rule.size)
        warnings.push(
          `Last set has ${chunk.length} of ${rule.size} matches — a scoreboard may have been missed.`,
        );
      sets.push({ matches: chunk, winnerIds: mostMatchWins(chunk) });
    }
    return sets;
  }

  // firstTo: team series. Close a set when a team hits `wins`, and start a
  // new one whenever the team compositions change.
  const sets: DraftSet[] = [];
  let current: DraftMatch[] = [];
  let currentRoster = "";
  const tally = new Map<string, number>();

  const close = (complete: boolean) => {
    if (current.length === 0) return;
    const [leader] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    if (!complete)
      warnings.push(
        `Set ${sets.length + 1} ended before anyone reached ${rule.wins} wins — check for a missed scoreboard or roster misread.`,
      );
    sets.push({
      matches: current,
      winnerIds: leader ? leader[0].split(",").map(Number) : [],
    });
    current = [];
    tally.clear();
  };

  for (const match of matches) {
    const roster = rosterKey(match.players);
    if (current.length > 0 && roster !== currentRoster) close(false);
    currentRoster = roster;
    current.push(match);

    const winningTeam = teamOf(match.players, match.winnerIds);
    if (winningTeam) {
      const wins = (tally.get(winningTeam) ?? 0) + 1;
      tally.set(winningTeam, wins);
      if (wins >= rule.wins) close(true);
    }
  }
  close(false);
  return sets;
}

/** Team-colour-agnostic identity of who played with whom. */
function rosterKey(players: DraftPlayer[]): string {
  const teams = new Map<string, number[]>();
  for (const p of players) {
    const key = p.teamKey ?? "solo";
    teams.set(key, [...(teams.get(key) ?? []), p.playerId]);
  }
  return [...teams.values()]
    .map((ids) => ids.sort((a, b) => a - b).join(","))
    .sort()
    .join("|");
}

/** The sorted player IDs of the team the winners belong to. */
function teamOf(players: DraftPlayer[], winnerIds: number[]): string | null {
  const winner = players.find((p) => winnerIds.includes(p.playerId));
  if (!winner) return null;
  return players
    .filter((p) => p.teamKey === winner.teamKey)
    .map((p) => p.playerId)
    .sort((a, b) => a - b)
    .join(",");
}

/** Players with the most match wins in a set (ties share the set). */
function mostMatchWins(matches: DraftMatch[]): number[] {
  const wins = new Map<number, number>();
  for (const match of matches)
    for (const id of match.winnerIds) wins.set(id, (wins.get(id) ?? 0) + 1);
  const best = Math.max(0, ...wins.values());
  if (best === 0) return [];
  return [...wins.entries()].filter(([, n]) => n === best).map(([id]) => id);
}

function statFingerprint(players: DraftPlayer[]): string {
  return players
    .map(
      (p) =>
        `${p.playerId}:` +
        p.stats
          .map((s) => `${s.stat}=${s.statValue}`)
          .sort()
          .join(","),
    )
    .sort()
    .join("|");
}
