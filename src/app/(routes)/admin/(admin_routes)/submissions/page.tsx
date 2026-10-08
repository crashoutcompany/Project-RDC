import { Suspense } from "react";
import { SubmissionTable } from "../../_components/SubmissionTable";
import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/headings";

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

function normalizePageParam(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? String(value[0]) : String(value);
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <H1 data-testid="admin-submissions-shell-marker">Submissions</H1>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <SubmissionsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SubmissionsTable({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const page = normalizePageParam(resolvedSearchParams.page);
  return (
    <div data-testid="admin-submissions-content">
      <SubmissionTable page={page} />
    </div>
  );
}
