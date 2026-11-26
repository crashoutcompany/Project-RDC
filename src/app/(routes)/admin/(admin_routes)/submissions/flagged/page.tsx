import { Suspense } from "react";
import Link from "next/link";
import { H1 } from "@/components/headings";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listFlaggedImports } from "@/app/actions/visionFlags";
import { STAT_CONFIGS } from "@/lib/stat-configs";
import { LOW_CONFIDENCE_THRESHOLD, PLAYER_NAME_FIELD } from "@/lib/visionTypes";
import { FlagReviewActions } from "./_components/FlagReviewActions";

const fieldLabel = (field: string) =>
  field === PLAYER_NAME_FIELD
    ? "Player name"
    : (Object.values(STAT_CONFIGS).find((config) => config.name === field)
        ?.displayName ?? field);

export default function Page() {
  return (
    <div>
      <H1 data-testid="admin-flagged-shell-marker">Flagged imports</H1>
      <p className="text-muted-foreground mb-4 max-w-prose text-sm">
        Fields vision read with under{" "}
        {Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}% confidence, on sessions
        not yet approved. A flag is a warning only: sessions can still be
        approved with flags open.
      </p>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <FlaggedImports />
      </Suspense>
    </div>
  );
}

async function FlaggedImports() {
  // Enforces admin itself; the proxy and layout are not the only gate.
  const { error, data } = await listFlaggedImports();
  if (error || !data)
    return (
      <div data-testid="admin-flagged-content" role="alert">
        {error ?? "Failed to load flagged imports"}
      </div>
    );

  if (data.flags.length === 0)
    return (
      <div data-testid="admin-flagged-content">No flagged imports.</div>
    );

  const playersBySession = Map.groupBy(data.players, (row) => row.sessionId);

  return (
    <div data-testid="admin-flagged-content">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session</TableHead>
            <TableHead>Match</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Read as</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.flags.map((flag) => (
            <TableRow key={flag.id} data-testid="vision-flag-row">
              <TableCell>
                <Link
                  className="hover:underline"
                  href={`/admin/submissions/approve/${flag.sessionId}`}
                >
                  {flag.session.sessionName}
                </Link>
                <div className="text-muted-foreground text-xs">
                  {flag.session.Game.gameName}
                </div>
              </TableCell>
              <TableCell>
                Set {flag.setIndex + 1}, match {flag.matchIndex + 1}
              </TableCell>
              <TableCell>{flag.player.playerName}</TableCell>
              <TableCell>{fieldLabel(flag.field)}</TableCell>
              <TableCell className="font-mono">{flag.readValue}</TableCell>
              <TableCell>{Math.round(flag.confidence * 100)}%</TableCell>
              <TableCell>
                <FlagReviewActions
                  flagId={flag.id}
                  isPlayerName={flag.field === PLAYER_NAME_FIELD}
                  readValue={flag.readValue}
                  currentPlayerId={flag.player.playerId}
                  players={(playersBySession.get(flag.sessionId) ?? []).map(
                    (row) => row.player,
                  )}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
