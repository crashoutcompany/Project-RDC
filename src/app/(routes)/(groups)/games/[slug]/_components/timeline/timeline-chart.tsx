"use client";

import dynamic from "next/dynamic";

const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false }
);
const Line = dynamic(
  () => import("recharts").then((mod) => mod.Line),
  { ssr: false }
);
const LineChart = dynamic(
  () => import("recharts").then((mod) => mod.LineChart),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import("recharts").then((mod) => mod.Tooltip),
  { ssr: false }
);
const XAxis = dynamic(
  () => import("recharts").then((mod) => mod.XAxis),
  { ssr: false }
);

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { type getAllSessionsByGame } from "prisma/lib/admin";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import { gameImages } from "@/lib/constants";
import { QueryResponseData } from "prisma/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { VideoInfo } from "./video-info";
import { logChartHoverToggle } from "@/posthog/client-analytics";

const chartConfig = {
  id: {
    label: "Game Id",
  },
  desktop: {
    label: "Desktop",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export type Sessions = QueryResponseData<
  Awaited<ReturnType<typeof getAllSessionsByGame>>
>;

export function TimelineChart({
  sessions,
  title,
  desc,
  gameName,
}: {
  sessions: Sessions;
  title: string;
  desc: string;
  gameName: keyof typeof gameImages;
}) {
  const [session, setSession] = useState<Sessions[0]>();
  const handleSetSession = useCallback((session: Sessions[0]) => {
    setSession(session);
  }, []);
  const [showMatchData, setShowMatchData] = useState(true);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6">
        <Header gameName={gameName} title={title} desc={desc} />
        <VideoInfo session={session} />
      </div>

      <Card>
        <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
          <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{desc}</CardDescription>
          </div>
          <div className="flex items-center justify-center gap-3 p-6">
            <Label htmlFor="showMatchData">Disable hover effects</Label>
            <Switch
              id="showMatchData"
              onCheckedChange={(val) => {
                if (val) setSession(undefined);
                setShowMatchData(!val);
                logChartHoverToggle(!val, gameName);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:p-6">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <LineChart
              accessibilityLayer
              data={sessions}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                }}
              />
              <Tooltip
                content={
                  <CustomTooltip
                    showMatchData={showMatchData}
                    setSession={handleSetSession}
                  />
                }
              />
              <Line
                dataKey={"sessionId"}
                type="monotone"
                stroke={`var(--chart-1)`}
                strokeWidth={2}
                dot={true}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

type CustomTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: Sessions[0];
    [key: string]: unknown;
  }>;
  label?: string | number;
};

const CustomTooltip = ({
  active,
  payload,
  setSession,
  showMatchData,
}: CustomTooltipProps & {
  setSession: (session: Sessions[0]) => void;
  showMatchData: boolean;
}) => {
  const session = (payload && payload[0] && payload[0].payload) as
    | Sessions[0]
    | undefined;

  useEffect(() => {
    if (active && showMatchData && session) {
      console.log(showMatchData);
      setSession(session);
    }
  }, [active, session, setSession, showMatchData]);

  if (active && session) {
    return (
      <div className="max-w-48 flex-wrap rounded-md p-2 shadow-md">
        <Card>
          <CardHeader>
            <CardTitle className="absolute">{session.sessionName}</CardTitle>
          </CardHeader>
          <CardContent>
            <Image
              className="h-auto w-auto"
              height={200}
              width={200}
              alt={session.sessionName}
              src={session.thumbnail}
            />
          </CardContent>
        </Card>
      </div>
    );
  }
  return null;
};

const Header = ({
  gameName,
  title,
  desc,
}: {
  gameName: keyof typeof gameImages;
  title: string;
  desc: string;
}) => {
  return (
    <div className="flex items-center gap-6">
      <Avatar className="h-24 w-24">
        <AvatarImage src={`/images/${gameImages[gameName]}`} alt={gameName} />
        <AvatarFallback>{gameName[0]}</AvatarFallback>
      </Avatar>
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
};
