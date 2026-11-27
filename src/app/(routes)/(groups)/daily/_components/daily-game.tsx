"use client";

import { useState } from "react";
import { Eyebrow } from "@/components/arcade/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  evaluateGuess,
  gameStatus,
  MAX_GUESSES,
  parseGuess,
  shareText,
  type DailyPuzzle,
  type DailyStats,
  type Feedback,
} from "@/lib/daily";
import { cn } from "@/lib/utils";
import { useDailyProgress } from "./use-daily-progress";

const VERDICT_STYLE = {
  correct: "border-ac-green bg-ac-green/15",
  close: "border-ac-gold bg-ac-gold/15",
  miss: "border-ac-panel-2 bg-ac-panel",
} as const;

const VERDICT_LABEL = {
  correct: "Correct",
  close: "Close",
  miss: "Miss",
} as const;

export function DailyGame({ puzzle }: { puzzle: DailyPuzzle }) {
  const { ready, guesses, stats, addGuess } = useDailyProgress(puzzle);
  const status = gameStatus(puzzle, guesses);

  return (
    <div
      data-testid="daily-game"
      data-kind={puzzle.kind}
      className="mx-auto max-w-3xl px-4 pb-16"
    >
      <Eyebrow>
        Daily #{puzzle.number} · {puzzle.game}
      </Eyebrow>
      <h1 className="ac-title text-ac-cream mt-4 text-2xl leading-snug md:text-3xl">
        {puzzle.prompt}
      </h1>
      <p className="text-ac-cream/70 mt-2" data-testid="daily-remaining">
        {ready
          ? `Guess ${Math.min(guesses.length + 1, MAX_GUESSES)} of ${MAX_GUESSES}`
          : "Loading your progress…"}
      </p>

      <ol className="mt-6 grid gap-2" aria-label="Guesses">
        {Array.from({ length: MAX_GUESSES }, (_, i) => {
          const guess = guesses[i];
          if (guess === undefined)
            return (
              <li
                key={i}
                className="border-ac-panel-2 h-12 border-2 border-dashed"
                aria-hidden
              />
            );
          return (
            <GuessRow
              key={guess}
              puzzle={puzzle}
              guess={guess}
              feedback={evaluateGuess(puzzle, guess)}
            />
          );
        })}
      </ol>

      {!ready ? null : status === "playing" ? (
        puzzle.kind === "leader" ? (
          <MemberPicker puzzle={puzzle} guesses={guesses} onGuess={addGuess} />
        ) : (
          <NumberForm puzzle={puzzle} guesses={guesses} onGuess={addGuess} />
        )
      ) : (
        <Result puzzle={puzzle} guesses={guesses} stats={stats} />
      )}
    </div>
  );
}

function GuessRow({
  puzzle,
  guess,
  feedback,
}: {
  puzzle: DailyPuzzle;
  guess: string;
  feedback: Feedback;
}) {
  const label =
    puzzle.kind === "leader"
      ? (feedback.row?.name ?? guess)
      : `${guess} ${puzzle.unit}`;
  let hint = "";
  if (feedback.verdict === "correct") hint = "Got it!";
  else if (puzzle.kind === "count")
    hint = feedback.direction === "higher" ? "Higher ▲" : "Lower ▼";
  else if (feedback.row)
    hint = `${feedback.row.value} ${puzzle.unit} · #${feedback.row.rank}`;

  return (
    <li
      data-testid="daily-guess"
      data-verdict={feedback.verdict}
      className={cn(
        "flex h-12 items-center justify-between gap-3 border-2 px-4",
        VERDICT_STYLE[feedback.verdict],
      )}
    >
      <span className="text-ac-cream font-bold">{label}</span>
      <span className="ac-label text-ac-cream/80">
        <span className="sr-only">{VERDICT_LABEL[feedback.verdict]}. </span>
        {feedback.verdict === "close" ? "Close! " : null}
        {hint}
      </span>
    </li>
  );
}

function MemberPicker({
  puzzle,
  guesses,
  onGuess,
}: {
  puzzle: Extract<DailyPuzzle, { kind: "leader" }>;
  guesses: string[];
  onGuess: (guess: string) => void;
}) {
  const members = puzzle.board.toSorted((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="mt-6">
      <p className="ac-label text-ac-gold mb-3">Pick a member</p>
      <div className="flex flex-wrap gap-2">
        {members.map((member) => (
          <Button
            key={member.slug}
            type="button"
            variant="outline"
            data-testid="daily-member-option"
            disabled={guesses.includes(member.slug)}
            onClick={() => onGuess(member.slug)}
          >
            {member.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

function NumberForm({
  puzzle,
  guesses,
  onGuess,
}: {
  puzzle: Extract<DailyPuzzle, { kind: "count" }>;
  guesses: string[];
  onGuess: (guess: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-6 flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const guess = parseGuess(puzzle, value);
        if (guess === null) return setError("Enter a whole number.");
        if (guesses.includes(guess))
          return setError("You already guessed that.");
        setError(null);
        setValue("");
        onGuess(guess);
      }}
    >
      <label htmlFor="daily-number" className="sr-only">
        Your guess
      </label>
      <Input
        id="daily-number"
        data-testid="daily-number-input"
        inputMode="numeric"
        autoComplete="off"
        placeholder={`Number of ${puzzle.unit}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "daily-number-error" : undefined}
        className="w-48"
      />
      <Button type="submit" data-testid="daily-submit">
        Guess
      </Button>
      {error ? (
        <p
          id="daily-number-error"
          role="alert"
          className="text-ac-red w-full text-sm"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}

function Result({
  puzzle,
  guesses,
  stats,
}: {
  puzzle: DailyPuzzle;
  guesses: string[];
  stats: DailyStats;
}) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const won = gameStatus(puzzle, guesses) === "won";
  const answer =
    puzzle.kind === "leader"
      ? (puzzle.board.find((r) => r.slug === puzzle.answer)?.name ??
        puzzle.answer)
      : `${puzzle.answer} ${puzzle.unit}`;
  const winRate =
    stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  return (
    <section
      data-testid="daily-result"
      data-status={won ? "won" : "lost"}
      className="border-ac-gold bg-ac-panel mt-6 border-4 p-6"
    >
      <h2 className="ac-title text-ac-cream text-xl">
        {won ? `Solved in ${guesses.length}/${MAX_GUESSES}` : "Out of guesses"}
      </h2>
      <p className="text-ac-cream/80 mt-2" data-testid="daily-answer">
        The answer was <strong className="text-ac-gold">{answer}</strong>.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          data-testid="daily-share"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareText(puzzle, guesses));
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          Copy result
        </Button>
        <span role="status" className="ac-label text-ac-cream/70">
          {copied === true ? "Copied!" : null}
          {copied === false ? "Couldn't copy. Try again." : null}
        </span>
      </div>

      <dl
        className="mt-6 grid grid-cols-4 gap-2 text-center"
        data-testid="daily-stats"
      >
        {[
          { label: "Played", value: stats.played },
          { label: "Win %", value: winRate },
          { label: "Streak", value: stats.streak },
          { label: "Best", value: stats.maxStreak },
        ].map((item) => (
          <div key={item.label} className="flex flex-col-reverse">
            <dt className="ac-label text-ac-cream/60">{item.label}</dt>
            <dd className="ac-title text-ac-cream text-2xl tabular-nums">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-ac-cream/60 mt-4 text-sm">
        A new puzzle unlocks at midnight Eastern.
      </p>
    </section>
  );
}
