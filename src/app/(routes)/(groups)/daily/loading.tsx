import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
