import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Breadcrumbs, Eyebrow } from "@/components/arcade/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { dayKeyFor } from "@/lib/daily";
import { getDailyPuzzle } from "./data";
import { DailyGame } from "./_components/daily-game";

export const metadata: Metadata = {
  title: "Daily Guess the Stat | RDC Stats Tracker",
  description:
    "A new RDC stat puzzle every day. Six guesses, same puzzle for everyone.",
};

export default function Page() {
  return (
    <div className="bg-ac-ink min-h-full">
      <div
        className="mx-auto max-w-3xl px-4 pt-6"
        data-testid="daily-shell-marker"
      >
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Daily" }]} />
      </div>
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-3xl" />}>
        <DailyContent />
      </Suspense>
    </div>
  );
}

async function DailyContent() {
  await connection();
  const puzzle = await getDailyPuzzle(dayKeyFor(new Date()));
  if (!puzzle)
    return (
      <div
        data-testid="daily-empty"
        className="mx-auto flex max-w-3xl flex-col items-start gap-4 px-4 py-16"
      >
        <Eyebrow>Daily puzzle</Eyebrow>
        <h1 className="ac-title text-ac-cream text-3xl">No puzzle today</h1>
        <p className="text-ac-cream/70">
          There aren&apos;t enough stats yet. Check back after the next session.
        </p>
      </div>
    );
  return <DailyGame puzzle={puzzle} />;
}
