import { Suspense } from "react";
import { SubmissionTable } from "../../_components/SubmissionTable";
import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/headings";

/**
 * Submissions list: title in shell; table streams with searchParams.
 */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  return (
    <div>
      <H1 data-testid="admin-submissions-shell-marker">Submissions</H1>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <SubmissionsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * Resolves searchParams and renders the submissions table.
 */
async function SubmissionsTable({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <div data-testid="admin-submissions-content">
      <SubmissionTable page={resolvedSearchParams.page} />
    </div>
  );
}
