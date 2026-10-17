"use client";

import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartConfig,
} from "@/components/ui/chart";

const BarChart = dynamic(() => import("recharts").then((mod) => mod.BarChart), {
  ssr: false,
});
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false },
);
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), {
  ssr: false,
});
const Bar = dynamic(() => import("recharts").then((mod) => mod.Bar), {
  ssr: false,
});

/**
 * Two-column chart layout: the tabbed wins chart (always last) spans both
 * columns, and an odd chart left before it does too so no row is half empty.
 */
export function ChartGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-8 md:grid-cols-2 md:[&>*:last-child]:col-span-2 md:[&>*:nth-last-child(2):nth-child(odd)]:col-span-2">
      {children}
    </div>
  );
}

export function CustomChart<T extends unknown[]>({
  data,
  nameKey,
  config,
  dataKey,
  title,
  description,
  // ignoreWarnings = false,
}: {
  data: T;
  nameKey: string;
  config: ChartConfig;
  dataKey: string;
  title: string;
  description: string;
  ignoreWarnings?: boolean;
}): React.ReactElement {
  // if (!ignoreWarnings && data.some((d) => typeof d=== "object" && d !== null && d[nameKey] === undefined))
  //   console.error("NameKey not present in data passed to chart.");
  // if (!ignoreWarnings && data.some((d) => typeof d=== "object" && d !== null && d[dataKey] === undefined))
  //   console.error("DataKey not present in data passed to chart");

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={nameKey}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend
              content={<ChartLegendContent nameKey={nameKey.toString()} />}
            />
            <Bar dataKey={dataKey} fill="var(--chart-1)" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
