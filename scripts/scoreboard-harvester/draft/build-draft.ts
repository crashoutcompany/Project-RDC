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
  // new one when players switch teams. Teams are accumulated across the set,
  // so a match where Azure dropped one row still counts for the full team.
  const sets: DraftSet[] = [];
  let current: DraftMatch[] = [];
  let teams: Set<number>[] = [];
  let tally: number[] = [];

  const close = (complete: boolean) => {
    if (current.length === 0) return;
    const best = Math.max(0, ...Array.from(tally, (n) => n ?? 0));
    const leader = best > 0 ? tally.indexOf(best) : -1;
    if (!complete)
      warnings.push(
        `Set ${sets.length + 1} ended before anyone reached ${rule.wins} wins — check for a missed scoreboard or roster misread.`,
      );
    sets.push({
      matches: current,
      winnerIds: leader >= 0 ? [...teams[leader]].sort((a, b) => a - b) : [],
    });
    current = [];
    teams = [];
    tally = [];
  };

  for (const match of matches) {
    const matchTeams = teamsOf(match.players);
    if (current.length > 0 && !teamsCompatible(teams, matchTeams)) close(false);
    teams = mergeTeams(teams, matchTeams);
    current.push(match);

    const winner = teams.findIndex((team) =>
      match.winnerIds.some((id) => team.has(id)),
    );
    if (winner >= 0) {
      tally[winner] = (tally[winner] ?? 0) + 1;
      if (tally[winner] >= rule.wins) close(true);
    }
  }
  close(false);
  return sets;
}

function teamsOf(players: DraftPlayer[]): Set<number>[] {
  const teams = new Map<string, Set<number>>();
  for (const p of players) {
    const key = p.teamKey ?? "solo";
    teams.set(key, (teams.get(key) ?? new Set()).add(p.playerId));
  }
  return [...teams.values()];
}

const teamIndex = (teams: Set<number>[], id: number) =>
  teams.findIndex((team) => team.has(id));

/** False when two players are teammates in one grouping but not the other. */
function teamsCompatible(a: Set<number>[], b: Set<number>[]): boolean {
  const ids = b
    .flatMap((team) => [...team])
    .filter((id) => teamIndex(a, id) >= 0);
  for (const x of ids)
    for (const y of ids) {
      const sameInA = teamIndex(a, x) === teamIndex(a, y);
      const sameInB = teamIndex(b, x) === teamIndex(b, y);
      if (sameInA !== sameInB) return false;
    }
  return true;
}

/** Folds a compatible match's teams into the set's running teams. */
function mergeTeams(
  teams: Set<number>[],
  incoming: Set<number>[],
): Set<number>[] {
  const merged = teams.map((team) => new Set(team));
  for (const team of incoming) {
    const known = [...team]
      .map((id) => teamIndex(merged, id))
      .find((i) => i >= 0);
    if (known !== undefined) team.forEach((id) => merged[known].add(id));
    else merged.push(new Set(team));
  }
  return merged;
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
