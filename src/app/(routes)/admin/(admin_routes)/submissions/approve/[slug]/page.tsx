import { getSessionById } from "prisma/lib/session";
import { getVisionFlagCounts } from "prisma/lib/vision-flags";
import { VisionFlagWarning } from "../_components/VisionFlagWarning";
import { sessionToFormValues } from "../../../../_utils/session-to-form";
import { ApproveSessionForm } from "../_components/ApproveSessionForm";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <div className="container mx-auto py-6">
      <h1
        className="mb-4 text-2xl font-bold"
        data-testid="admin-approve-shell-marker"
      >
        Review Session
      </h1>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <Component params={params} />
      </Suspense>
    </div>
  );
}

const Component = async ({ params }: { params: Promise<{ slug: string }> }) => {
  const sessionId = parseInt((await params).slug);

  if (isNaN(sessionId))
    return <div className="container mx-auto py-6">Invalid session ID</div>;

  const [session, flagCounts] = await Promise.all([
    getSessionById(sessionId),
    getVisionFlagCounts(sessionId),
  ]);

  if (!session?.data) {
    return <div className="container mx-auto py-6">Session not found</div>;
  }

  return (
    <div data-testid="admin-approve-content">
      <VisionFlagWarning {...flagCounts} />
      <ApproveSessionForm
        defaultValues={sessionToFormValues(session.data)}
        sessionId={sessionId}
      />
    </div>
  );
};
