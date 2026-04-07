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
        <Card className="bg-muted/40 flex aspect-video items-center justify-center rounded-lg border-2 border-dashed lg:col-span-3">
          <div className="text-center">
            <h3 className="text-lg font-semibold">No Replay Selected</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Select a session from the library to preview.
            </p>
          </div>
        </Card>
        <Card className="bg-muted/40 flex min-h-[200px] items-center justify-center rounded-lg border-2 border-dashed lg:col-span-2">
          <div className="text-center">
            <h3 className="text-lg font-semibold">Session Info</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Stats will appear here when a session is selected.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wide">
            Replay Viewer
          </h2>
          <p className="text-muted-foreground text-xs">
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
            className="group relative block overflow-hidden rounded-lg"
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
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90">
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
              <h3 className="font-semibold group-hover:underline">
                {session.sessionName}
              </h3>
              <p className="text-muted-foreground text-xs">
                {new Date(session.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </Link>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <Card className="flex flex-1 flex-col overflow-hidden p-4">
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider">
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
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="mt-auto w-full">
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
