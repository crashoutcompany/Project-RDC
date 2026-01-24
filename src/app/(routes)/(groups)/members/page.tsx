import { getMembersNav } from "prisma/lib/members";
import { MembersClient } from "./_components/MembersClient";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

async function MembersContent() {
  const members = await getMembersNav();
  return <MembersClient members={members} />;
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <MembersContent />
    </Suspense>
  );
}
