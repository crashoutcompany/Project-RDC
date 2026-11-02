"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrendPoint } from "@/lib/member-profile";

// Recharts is heavy and the chart sits below the fold, so load it on demand.
const WinRateChart = dynamic(() => import("./win-rate-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full" />,
});

export function WinRateTrend({ data }: { data: TrendPoint[] }) {
  return <WinRateChart data={data} />;
}
