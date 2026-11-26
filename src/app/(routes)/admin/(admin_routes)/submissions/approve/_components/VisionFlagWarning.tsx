import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/**
 * Warns that vision read some fields with low confidence. A warning only:
 * approval stays available whatever the counts are.
 */
export function VisionFlagWarning({
  pending,
  rejected,
}: {
  pending: number;
  rejected: number;
}) {
  if (pending === 0 && rejected === 0) return null;
  const fields = (n: number) => `${n} field${n === 1 ? "" : "s"}`;

  return (
    <div
      role="status"
      data-testid="vision-flag-warning"
      className="mb-4 flex gap-3 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm"
    >
      <TriangleAlert className="size-5 shrink-0 text-yellow-500" />
      <div className="space-y-1">
        {pending > 0 && (
          <p>
            Vision read {fields(pending)} in this session with low confidence.{" "}
            <Link className="underline" href="/admin/submissions/flagged">
              Review them
            </Link>{" "}
            before approving.
          </p>
        )}
        {rejected > 0 && (
          <p>
            {fields(rejected)} {rejected === 1 ? "was" : "were"} marked wrong
            in review. Fix {rejected === 1 ? "it" : "them"} from Edit.
          </p>
        )}
        <p className="text-muted-foreground">
          You can still approve the session.
        </p>
      </div>
    </div>
  );
}
