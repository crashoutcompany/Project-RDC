"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import MatchData from "../match-data";
import type { Sessions } from "../../_helpers/dashboard";
import { formatSessionDate } from "@/lib/utils";

type ReplayViewerProps = {
  session: Sessions[0] | null;
};

/**
 * Renders the active replay viewer. Shows the currently selected session's
 * thumbnail (linking to the video) and a dialog trigger for detailed match stats.
 *
 * @param props - Contains the currently selected session, or null if none selected.
 * @returns The replay viewer JSX element.
 */
export function ReplayViewer({ session }: ReplayViewerProps) {
  if (!session) {
    return (
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="border-ac-panel-2 flex aspect-video items-center justify-center border-2 border-dashed bg-black lg:col-span-3">
          <div className="text-center">
            <h3 className="ac-title text-ac-cream text-xl">No replay selected</h3>
            <p className="text-ac-cream/70 mt-1 text-sm">
              Select a session from the library to preview.
            </p>
            <p className="ac-label text-ac-gold mt-3">▲ Pick a tape</p>
          </div>
        </div>
        <div className="border-ac-panel-2 bg-ac-panel flex min-h-[200px] items-center justify-center border-2 border-dashed p-6 lg:col-span-2">
          <div className="text-center">
            <h3 className="ac-title text-ac-cream text-xl">Session info</h3>
            <p className="text-ac-cream/70 mt-1 text-sm">
              Stats will appear here when a session is selected.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="ac-title text-ac-cream text-2xl">
            Replay <span className="text-ac-gold">viewer</span>
          </h2>
          <p className="text-ac-cream/70 text-sm">
            Active session preview
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Link
            href={session.sessionUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="group relative block overflow-hidden"
          >
            <div className="relative aspect-video">
              <Image
                src={session.thumbnail}
                alt={session.sessionName}
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="bg-ac-gold ac-skew-sm flex h-14 w-16 items-center justify-center">
                  <svg
                    className="ml-1 h-6 w-6 text-black"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="mt-2">
              <h3 className="ac-title text-ac-cream text-base group-hover:text-ac-gold">
                {session.sessionName}
              </h3>
              <p className="text-muted-foreground text-xs">
                {formatSessionDate(session.date)}
              </p>
            </div>
          </Link>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <Card className="border-ac-gold flex flex-1 flex-col overflow-hidden border-2 p-4">
            <h4 className="ac-title text-ac-cream mb-2 text-lg">
              Session Info
            </h4>
            <div className="text-muted-foreground mb-3 space-y-1 text-sm">
              <p>
                <span className="text-foreground font-medium">Game:</span>{" "}
                {session.Game.gameName}
              </p>
              <p>
                <span className="text-foreground font-medium">Sets:</span>{" "}
                {session.sets.length}
              </p>
              <p>
                <span className="text-foreground font-medium">Matches:</span>{" "}
                {session.sets.reduce((acc: number, set: { matches: unknown[] }) => acc + set.matches.length, 0)}
              </p>
              {session.mvp && (
                <p>
                  <span className="text-foreground font-medium">MVP:</span>{" "}
                  {session.mvp.playerName}
                </p>
              )}
            </div>
            <Link
              href={`/sessions/${session.sessionId}`}
              className="ac-label text-ac-gold hover:text-ac-cream mb-3"
            >
              Session page ▶
            </Link>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="ac-title mt-auto w-full text-xs">
                  View Full Stats
                </Button>
              </DialogTrigger>
              <DialogContent className="h-screen max-w-3xl">
                <DialogHeader className="space-y-0">
                  <DialogTitle>Session Info</DialogTitle>
                  <DialogDescription>
                    Detailed stats for {session.sessionName}
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[80vh]">
                  <MatchData session={session} />
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </Card>
        </div>
      </div>
    </div>
  );
}
