import EntryCreatorForm from "../../../../_components/form/EntryCreatorForm";
import { getSessionById } from "prisma/lib/session";
import { sessionToFormValues } from "../../../../_utils/session-to-form";
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
        className="mb-6 text-2xl font-bold"
        data-testid="admin-edit-shell-marker"
      >
        Edit Session
      </h1>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <EditSessionContent params={params} />
      </Suspense>
    </div>
  );
}

async function EditSessionContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const sessionId = parseInt((await params).slug);

  if (isNaN(sessionId)) return <div>Invalid session ID</div>;

  const session = await getSessionById(sessionId);

  if (!session?.data) {
    return <div>Session not found</div>;
  }

  const defaultValues = sessionToFormValues(session.data);

  return (
    <div data-testid="admin-edit-content">
      <EntryCreatorForm
        rdcMembers={defaultValues.players}
        defaultValues={defaultValues}
        type="edit"
      />
    </div>
  );
}
