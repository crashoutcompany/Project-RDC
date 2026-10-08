"use client";

import dynamic from "next/dynamic";

const Pie = dynamic(
  () => import("recharts").then((mod) => mod.Pie),
  { ssr: false }
);
const PieChart = dynamic(
  () => import("recharts").then((mod) => mod.PieChart),
  { ssr: false }
);
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "./ui/chart";
import { SorryData } from "@/app/page";

export const PieChartRDC = ({
  config,
  data,
}: {
  config: ChartConfig;
  data: SorryData[];
}) => {
  // This Chart will rank the average of placements in each category.
  // TODO Responsive not working. May need to mess with config or use grid resizing via css.
  return (
    <Card className="-ml-16 h-fit w-screen max-w-3xl min-w-fit transition-colors duration-500 hover:border-white md:m-auto md:w-72 lg:ml-0 lg:w-max">
      <CardHeader>
        <CardTitle>Sorry scale</CardTitle>
        <CardDescription>
          This chart represents the average ranking of each member across all
          games. AKA who is the sorriest
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer className="min-h-32" config={config}>
          <PieChart>
            <Pie data={data} dataKey="sorryScale" nameKey="player" />
            <ChartLegend content={<ChartLegendContent />} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};
