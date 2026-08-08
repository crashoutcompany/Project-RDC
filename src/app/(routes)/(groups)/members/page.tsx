import { getMembersNav } from "prisma/lib/members";
import { MembersClient } from "./_components/MembersClient";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/headings";

/**
 * Members index: H1 commits in the static shell; member grid streams in.
 */
export default function Page() {
  return (
    <div className="m-16">
      <H1 data-testid="members-shell-marker">Members</H1>
      <Suspense fallback={<MembersGridSkeleton />}>
        <MembersContent />
      </Suspense>
    </div>
  );
}

/**
 * Loads member nav data for the client grid.
 */
async function MembersContent() {
  "use cache";
  const members = await getMembersNav();
  return (
    <div data-testid="members-content">
      <MembersClient members={members} showHeading={false} />
    </div>
  );
}

/**
 * Matches the member avatar grid footprint from MembersClient / (groups)/loading.
 */
function MembersGridSkeleton() {
  return (
    <div className="flex flex-wrap justify-center gap-10">
      <Skeleton className="h-32 w-32 rounded-full" />
      <Skeleton className="h-32 w-32 rounded-full" />
      <Skeleton className="h-32 w-32 rounded-full" />
      <Skeleton className="h-32 w-32 rounded-full" />
    </div>
  );
}
