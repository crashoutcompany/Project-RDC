"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { backfillMissingMvps } from "@/app/actions/adminAction";

type BackfillResult = Awaited<ReturnType<typeof backfillMissingMvps>>;

/** Generates MVPs for approved sessions that are still missing one. */
export function BackfillMvpButton() {
  const [isRunning, startTransition] = useTransition();
  const [result, setResult] = useState<BackfillResult | null>(null);

  return (
    <div className="my-4 flex flex-wrap items-center gap-4">
      <Button
        className="cursor-pointer disabled:cursor-auto"
        disabled={isRunning}
        onClick={() =>
          startTransition(async () => {
            try {
              setResult(await backfillMissingMvps());
            } catch (error) {
              console.log("Unexpected error", error);
              setResult({ error: "Backfill failed" });
            }
          })
        }
      >
        {isRunning ? "Generating MVPs..." : "Backfill missing MVPs"}
      </Button>
      {result &&
        ("error" in result ? (
          <p className="text-destructive text-sm">{result.error}</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Generated {result.processed} MVP(s), {result.failed.length} failed
            {result.remaining !== null && `, ${result.remaining} still missing`}
            .
          </p>
        ))}
    </div>
  );
}
