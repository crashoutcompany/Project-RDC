import { H1 } from "@/components/headings";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllMembers } from "prisma/lib/members";
import EntryCreatorForm from "./_components/form/EntryCreatorForm";
import { NoMembers } from "../(groups)/members/_components/members";

/**
 * Admin home: H1 commits in the shell; entry form streams behind Suspense.
 */
export default function Page() {
  return (
    <div>
      <H1 data-testid="admin-shell-marker">Admin</H1>
      <Suspense fallback={<Skelly />}>
        <AdminForm />
      </Suspense>
    </div>
  );
}

/**
 * Loads members for the entry creator form (cached).
 */
async function AdminForm() {
  const members = await getAllMembers();
  if (!members.success || !members.data || members.data.length === 0)
    return <NoMembers />;
  return (
    <div data-testid="admin-content">
      <EntryCreatorForm rdcMembers={members.data} type="create" />
    </div>
  );
}

/**
 * Reuses the form-row skeleton footprint already used on this page.
 */
const Skelly = () => {
  return (
    <div>
      <Skeleton className="mb-4 h-9 w-1/4" />
      <Skeleton className="h-10 w-full border-b" />
      <Skeleton className="h-10 w-full border-b" />
      <Skeleton className="h-10 w-full border-b" />
    </div>
  );
};
