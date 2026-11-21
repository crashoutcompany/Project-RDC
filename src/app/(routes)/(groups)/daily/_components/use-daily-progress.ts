"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  emptyStats,
  gameStatus,
  recordResult,
  type DailyPuzzle,
  type DailyStats,
} from "@/lib/daily";

const PROGRESS_KEY = "rdc-daily-progress-v1";
const STATS_KEY = "rdc-daily-stats-v1";
const CHANGE_EVENT = "rdc-daily-change";

type Progress = { dayKey: string; puzzleId: string; guesses: string[] };

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Raw strings keep the snapshot referentially stable between reads. */
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or quota: the game still works, it just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Today's guesses and lifetime stats from localStorage. `ready` is false
 * during SSR and hydration, when storage can't be read yet. Progress saved
 * for another day or question is ignored, which is how the game rolls over.
 */
export function useDailyProgress(puzzle: DailyPuzzle) {
  const progressRaw = useSyncExternalStore(
    subscribe,
    () => read(PROGRESS_KEY),
    () => undefined,
  );
  const statsRaw = useSyncExternalStore(
    subscribe,
    () => read(STATS_KEY),
    () => undefined,
  );

  const saved = parse<Progress>(progressRaw ?? null);
  const guesses =
    saved?.dayKey === puzzle.dayKey &&
    saved.puzzleId === puzzle.id &&
    Array.isArray(saved.guesses)
      ? saved.guesses.map(String)
      : [];
  const stats = { ...emptyStats(), ...parse<DailyStats>(statsRaw ?? null) };

  const addGuess = useCallback(
    (guess: string) => {
      const current = parse<Progress>(read(PROGRESS_KEY));
      const previous =
        current?.dayKey === puzzle.dayKey && current.puzzleId === puzzle.id
          ? current.guesses
          : [];
      if (gameStatus(puzzle, previous) !== "playing") return;
      if (previous.includes(guess)) return;

      const next = [...previous, guess];
      write(PROGRESS_KEY, {
        dayKey: puzzle.dayKey,
        puzzleId: puzzle.id,
        guesses: next,
      } satisfies Progress);

      const status = gameStatus(puzzle, next);
      if (status === "playing") return;
      const before = {
        ...emptyStats(),
        ...parse<DailyStats>(read(STATS_KEY)),
      };
      write(
        STATS_KEY,
        recordResult(before, puzzle.dayKey, status === "won", next.length),
      );
    },
    [puzzle],
  );

  return {
    ready: progressRaw !== undefined && statsRaw !== undefined,
    guesses,
    stats,
    addGuess,
  };
}
