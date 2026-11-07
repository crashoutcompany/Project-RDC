import type { Arena } from "@/lib/rdc-stats";

/**
 * Daily "Guess the stat": pure puzzle selection, guess evaluation, share
 * text and local stats. No server imports, so the client game can use it.
 */

export const MAX_GUESSES = 6;
/** Puzzles roll over at midnight in this zone, so the US evening crowd shares a day. */
export const DAILY_TIME_ZONE = "America/New_York";
/** Puzzle #1. */
export const DAILY_EPOCH = "2026-11-01";
export const SHARE_URL = "rdcstats.com/daily";

const METRICS = {
  matches: "match wins",
  sets: "set wins",
  days: "day wins",
} as const;
export type DailyMetric = keyof typeof METRICS;

/** Smallest stat worth asking "how many" about. */
const MIN_COUNT = 3;

export type BoardRow = {
  slug: string;
  name: string;
  value: number;
  /** Competition rank, 1 = leader; ties share a rank. */
  rank: number;
};

type PuzzleBase = {
  /** Stable id of the question; progress is dropped if it changes mid-day. */
  id: string;
  game: string;
  metric: DailyMetric;
  unit: string;
  prompt: string;
};

/** "Who has the most X in Y?" Guess a member. */
export type LeaderPuzzle = PuzzleBase & {
  kind: "leader";
  answer: string;
  board: BoardRow[];
};

/** "How many X does M have in Y?" Guess a number. */
export type CountPuzzle = PuzzleBase & {
  kind: "count";
  member: string;
  answer: number;
};

export type Puzzle = LeaderPuzzle | CountPuzzle;
export type DailyPuzzle = Puzzle & { dayKey: string; number: number };

/** YYYY-MM-DD for `date` in the daily time zone. */
export function dayKeyFor(date: Date, timeZone = DAILY_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const dayIndex = (dayKey: string) =>
  Math.round(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);

export const puzzleNumber = (dayKey: string) =>
  dayIndex(dayKey) - dayIndex(DAILY_EPOCH) + 1;

/** The day before `dayKey`, as a day key. */
export const previousDay = (dayKey: string) =>
  new Date(Date.parse(`${dayKey}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

/** 32-bit FNV-1a. Stable across runtimes, unlike anything seeded by Math.random. */
function hash(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Rows sorted by value desc then name, with competition ranks. */
export function rankBoard(rows: Omit<BoardRow, "rank">[]): BoardRow[] {
  const sorted = rows.toSorted(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name),
  );
  return sorted.map((row) => ({
    ...row,
    rank: sorted.findIndex((r) => r.value === row.value) + 1,
  }));
}

/**
 * Every question the current stats can support. Leader puzzles need a single
 * clear leader; count puzzles need a stat of at least `MIN_COUNT`.
 * `members` is the guessable roster (members with no wins still count as 0).
 */
export function buildCandidates(
  arenas: Arena[],
  members: { slug: string; name: string }[],
): Puzzle[] {
  const candidates: Puzzle[] = [];
  for (const arena of arenas)
    for (const [metric, unit] of Object.entries(METRICS) as [
      DailyMetric,
      string,
    ][]) {
      const board = rankBoard(
        members.map(({ slug, name }) => ({
          slug,
          name,
          value: arena.records[slug]?.[metric] ?? 0,
        })),
      );
      const [first, second] = board;
      if (first && first.value > 0 && second && second.value < first.value)
        candidates.push({
          kind: "leader",
          id: `leader:${arena.slug}:${metric}`,
          game: arena.name,
          metric,
          unit,
          prompt: `Who has the most ${unit} in ${arena.name}?`,
          answer: first.slug,
          board,
        });

      for (const row of board)
        if (row.value >= MIN_COUNT)
          candidates.push({
            kind: "count",
            id: `count:${arena.slug}:${metric}:${row.slug}`,
            game: arena.name,
            metric,
            unit,
            prompt: `How many ${unit} does ${row.name} have in ${arena.name}?`,
            member: row.name,
            answer: row.value,
          });
    }
  return candidates;
}

/**
 * The puzzle for `dayKey`. Days alternate between leader and count questions
 * (falling back to whichever exists), then rendezvous hashing picks one: each
 * candidate scores `hash(day + id)` and the lowest wins. A newly approved
 * session only changes today's pick if it adds the new lowest scorer, so the
 * puzzle stays put for nearly everyone when stats change mid-day.
 */
export function selectPuzzle(
  dayKey: string,
  candidates: Puzzle[],
): DailyPuzzle | null {
  const number = puzzleNumber(dayKey);
  const kind = number % 2 === 0 ? "count" : "leader";
  const preferred = candidates.filter((c) => c.kind === kind);
  const pool = preferred.length > 0 ? preferred : candidates;
  if (pool.length === 0) return null;

  let best = pool[0];
  let bestScore = hash(`${dayKey}|${best.id}`);
  for (const candidate of pool.slice(1)) {
    const score = hash(`${dayKey}|${candidate.id}`);
    if (score < bestScore || (score === bestScore && candidate.id < best.id)) {
      best = candidate;
      bestScore = score;
    }
  }
  return { ...best, dayKey, number };
}

export type Verdict = "correct" | "close" | "miss";

export type Feedback = {
  verdict: Verdict;
  /** Count puzzles: which way the answer lies from the guess. */
  direction?: "higher" | "lower";
  /** Leader puzzles: the guessed member's row on the board. */
  row?: BoardRow;
};

/** How far off a count guess may be and still be "close": 10%, at least 2. */
export const closeMargin = (answer: number) =>
  Math.max(2, Math.round(answer * 0.1));

/**
 * Grades one guess. Leader guesses are member slugs and are "close" when the
 * member ranks 2nd or has at least 75% of the leader's total. Count guesses
 * are numbers (as strings) and are "close" within `closeMargin`.
 */
export function evaluateGuess(puzzle: Puzzle, guess: string): Feedback {
  if (puzzle.kind === "leader") {
    const row = puzzle.board.find((r) => r.slug === guess);
    if (guess === puzzle.answer) return { verdict: "correct", row };
    const leader = puzzle.board[0].value;
    const close = !!row && (row.rank === 2 || row.value >= leader * 0.75);
    return { verdict: close ? "close" : "miss", row };
  }

  const value = Number(guess);
  if (value === puzzle.answer) return { verdict: "correct" };
  const direction = puzzle.answer > value ? "higher" : "lower";
  const close = Math.abs(puzzle.answer - value) <= closeMargin(puzzle.answer);
  return { verdict: close ? "close" : "miss", direction };
}

/** Normalizes raw input to a guess, or null if it isn't a valid one. */
export function parseGuess(puzzle: Puzzle, input: string): string | null {
  const value = input.trim().toLowerCase();
  if (puzzle.kind === "leader")
    return puzzle.board.some((r) => r.slug === value) ? value : null;
  if (!/^\d{1,6}$/.test(value)) return null;
  return String(Number(value));
}

export type GameStatus = "playing" | "won" | "lost";

export function gameStatus(puzzle: Puzzle, guesses: string[]): GameStatus {
  if (guesses.some((g) => evaluateGuess(puzzle, g).verdict === "correct"))
    return "won";
  return guesses.length >= MAX_GUESSES ? "lost" : "playing";
}

const EMOJI: Record<Verdict, string> = {
  correct: "🟩",
  close: "🟨",
  miss: "⬛",
};

/**
 * Spoiler-free share text: puzzle number, score and one square per guess.
 * Count puzzles add the arrow hint, which doesn't reveal the number.
 */
export function shareText(puzzle: DailyPuzzle, guesses: string[]) {
  const status = gameStatus(puzzle, guesses);
  const score = status === "won" ? guesses.length : "X";
  const grid = guesses
    .map((g) => {
      const { verdict, direction } = evaluateGuess(puzzle, g);
      if (verdict === "correct" || !direction) return EMOJI[verdict];
      return EMOJI[verdict] + (direction === "higher" ? "⬆️" : "⬇️");
    })
    .join(puzzle.kind === "count" ? "\n" : "");
  return `RDC Daily #${puzzle.number} ${score}/${MAX_GUESSES}\n${grid}\n${SHARE_URL}`;
}

export type DailyStats = {
  played: number;
  won: number;
  streak: number;
  maxStreak: number;
  /** Wins by guess count; index 0 = solved in one. */
  distribution: number[];
  /** Day key of the last finished game, so a day is only counted once. */
  lastDay: string | null;
};

export const emptyStats = (): DailyStats => ({
  played: 0,
  won: 0,
  streak: 0,
  maxStreak: 0,
  distribution: Array(MAX_GUESSES).fill(0),
  lastDay: null,
});

/** Folds a finished game into the stats. Recording the same day twice is a no-op. */
export function recordResult(
  stats: DailyStats,
  dayKey: string,
  won: boolean,
  guessCount: number,
): DailyStats {
  if (stats.lastDay === dayKey) return stats;
  const continues = stats.lastDay === previousDay(dayKey);
  const streak = won ? (continues ? stats.streak + 1 : 1) : 0;
  const distribution = [...stats.distribution];
  if (won) distribution[guessCount - 1] = (distribution[guessCount - 1] ?? 0) + 1;
  return {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    streak,
    maxStreak: Math.max(stats.maxStreak, streak),
    distribution,
    lastDay: dayKey,
  };
}
