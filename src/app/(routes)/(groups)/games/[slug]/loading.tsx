import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-56 w-full rounded-xl sm:h-64 md:h-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[280px] rounded-lg" />
        <Skeleton className="h-[280px] rounded-lg" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-px w-full" />
      <Skeleton className="aspect-video w-full rounded-lg lg:w-3/5" />
    </div>
  );
}
