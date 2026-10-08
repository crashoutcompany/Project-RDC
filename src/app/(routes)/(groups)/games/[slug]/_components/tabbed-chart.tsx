"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useState } from "react";
import dynamic from "next/dynamic";
import { logChartTabClick } from "@/posthog/client-analytics";

const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false }
);
const XAxis = dynamic(
  () => import("recharts").then((mod) => mod.XAxis),
  { ssr: false }
);
const Bar = dynamic(
  () => import("recharts").then((mod) => mod.Bar),
  { ssr: false }
);
const BarChart = dynamic(
  () => import("recharts").then((mod) => mod.BarChart),
  { ssr: false }
);
const YAxis = dynamic(
  () => import("recharts").then((mod) => mod.YAxis),
  { ssr: false }
);

export const TabbedChart = ({
  chartConfig,
  chartData,
  gameName,
}: {
  chartConfig: ChartConfig;
  chartData: unknown[]; // TODO Define a proper type for chartData
  gameName: string;
}) => {
  const [activeChart, setActiveChart] = useState("matchWins");
  // TODO Set up days won
  return (
    <Card style={{ minWidth: "100%" }}>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>Games, Sets, & Days won</CardTitle>
          <CardDescription>
            View the amount of games and days won for each player.
          </CardDescription>
        </div>
        <div className="flex">
          {["matchWins", "setWins", "days"].map((key) => {
            const chart = key as keyof typeof chartConfig;
            return (
              <button
                key={chart}
                data-active={activeChart === chart}
                className="data-[active=true]:bg-muted/50 relative z-30 flex flex-1 cursor-pointer flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
                onClick={() => {
                  setActiveChart(chart);
                  logChartTabClick(chart, gameName);
                }}
              >
                <span className="text-muted-foreground text-xs">
                  {chartConfig[chart].label}
                </span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="player"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent nameKey="player" />} />
            <Bar dataKey={activeChart} fill="var(--chart-4)" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};
