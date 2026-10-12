"use client";

import { useState } from "react";
import Image from "next/image";
import type { Sessions } from "../../_helpers/dashboard";
import { formatSessionDate } from "@/lib/utils";

type ReplayLibraryProps = {
  sessions: Sessions;
  onSelectSession: (session: Sessions[0]) => void;
};

const INITIAL_COUNT = 4;
const PAGE_SIZE = 8;

/**
 * Grid of session "tapes". Shows 4, then reveals more in pages of 8 after
 * "Browse all". Games with no sessions show NO SIGNAL placeholders.
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

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="ac-title text-ac-cream text-2xl">
            Replay <span className="text-ac-blue">library</span>
          </h2>
          <p className="text-ac-cream/70 text-sm">
            {totalCount || "--"} session{totalCount !== 1 ? "s" : ""} recorded
          </p>
        </div>
        {!isExpanded && totalCount > INITIAL_COUNT && (
          <TapeButton
            onClick={() => {
              setIsExpanded(true);
              setVisibleCount(INITIAL_COUNT + PAGE_SIZE);
            }}
          >
            Browse all ({totalCount})
          </TapeButton>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {displayedSessions.map((session) => (
          <button
            key={session.sessionId}
            type="button"
            onClick={() => onSelectSession(session)}
            className="group border-ac-panel-2 bg-ac-panel hover:border-ac-gold cursor-pointer overflow-hidden border-2 text-left transition-colors"
          >
            <div className="relative aspect-video">
              {session.thumbnail ? (
                <Image
                  src={session.thumbnail}
                  alt={session.sessionName}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover transition-transform group-hover:scale-105 motion-reduce:transition-none"
                />
              ) : (
                <NoSignal />
              )}
            </div>
            <div className="p-2">
              <p className="ac-title text-ac-cream truncate text-xs">
                {session.sessionName}
              </p>
              <p className="text-ac-cream/60 text-xs">
                {formatSessionDate(session.date)}
              </p>
            </div>
          </button>
        ))}
        {totalCount === 0 &&
          Array.from({ length: INITIAL_COUNT }, (_, i) => (
            <div key={i} className="border-ac-panel-2 bg-ac-panel border-2">
              <div className="relative aspect-video">
                <NoSignal />
              </div>
              <div className="p-2">
                <p className="ac-title text-ac-cream/70 text-xs">
                  [Video title]
                </p>
                <p className="text-ac-cream/50 text-xs">[date]</p>
              </div>
            </div>
          ))}
      </div>
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <TapeButton
            onClick={() =>
              setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, totalCount))
            }
          >
            Load more ({visibleCount} of {totalCount})
          </TapeButton>
        </div>
      )}
      {isExpanded && !hasMore && totalCount > INITIAL_COUNT && (
        <div className="mt-4 flex justify-center">
          <TapeButton
            onClick={() => {
              setIsExpanded(false);
              setVisibleCount(INITIAL_COUNT);
            }}
          >
            Show less
          </TapeButton>
        </div>
      )}
    </div>
  );
}

function NoSignal() {
  return (
    <div className="ac-label text-ac-cream/50 absolute inset-0 grid place-items-center bg-[repeating-linear-gradient(-45deg,#1d1b23_0_10px,#16141b_10px_20px)]">
      No signal
    </div>
  );
}

function TapeButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ac-title ac-skew-sm border-ac-cream text-ac-cream hover:bg-ac-cream hover:text-ac-ink cursor-pointer border-2 px-5 py-1.5 text-xs transition-colors"
    >
      {children}
    </button>
  );
}
