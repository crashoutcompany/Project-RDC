"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { Sessions } from "../../_helpers/dashboard";

type ReplayLibraryProps = {
  sessions: Sessions;
  onSelectSession: (session: Sessions[0]) => void;
};

const INITIAL_COUNT = 4;
const PAGE_SIZE = 8;

/**
 * Shows a grid of session thumbnails. Initially shows 4 items.
 * When "Browse All" is clicked, reveals additional items in paginated batches.
 *
 * @param props - Contains sessions array and a callback when a session is selected.
 * @returns The replay library JSX element.
 */
export function ReplayLibrary({
  sessions,
  onSelectSession,
}: ReplayLibraryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const displayedSessions = isExpanded
    ? sortedSessions.slice(0, visibleCount)
    : sortedSessions.slice(0, INITIAL_COUNT);

  const totalCount = sortedSessions.length;
  const hasMore = isExpanded && visibleCount < totalCount;

  /**
   * Handles clicking the "Browse All" button; expands to show more items.
   */
  function handleBrowseAll() {
    setIsExpanded(true);
    setVisibleCount(INITIAL_COUNT + PAGE_SIZE);
  }

  /**
   * Loads the next page of sessions into the visible set.
   */
  function handleLoadMore() {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, totalCount));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wide">
            Replay Library
          </h2>
          <p className="text-muted-foreground text-xs">
            {totalCount} session{totalCount !== 1 ? "s" : ""} recorded
          </p>
        </div>
        {!isExpanded && totalCount > INITIAL_COUNT && (
          <Button variant="outline" size="sm" onClick={handleBrowseAll}>
            Browse All ({totalCount})
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {displayedSessions.map((session) => (
          <button
            key={session.sessionId}
            onClick={() => onSelectSession(session)}
            className="group cursor-pointer overflow-hidden rounded-lg border transition-all hover:ring-2 hover:ring-chart-1"
          >
            <div className="relative aspect-video">
              <Image
                src={session.thumbnail}
                alt={session.sessionName}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover transition-transform group-hover:scale-105"
              />
            </div>
            <div className="bg-card p-2">
              <p className="truncate text-xs font-medium">
                {session.sessionName}
              </p>
              <p className="text-muted-foreground text-xs">
                {new Date(session.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </button>
        ))}
      </div>
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={handleLoadMore}>
            Load More ({visibleCount} of {totalCount})
          </Button>
        </div>
      )}
      {isExpanded && !hasMore && totalCount > INITIAL_COUNT && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsExpanded(false);
              setVisibleCount(INITIAL_COUNT);
            }}
          >
            Show Less
          </Button>
        </div>
      )}
    </div>
  );
}
