"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/member-profile";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function WinRateTrend({ data }: { data: TrendPoint[] }) {
  return (
    <div className="border-ac-gold bg-ac-panel h-72 w-full border-4 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="#2a2766" vertical={false} />
          <XAxis dataKey="month" stroke="#f2efff" tickLine={false} />
          <YAxis
            domain={[0, 1]}
            tickFormatter={pct}
            stroke="#f2efff"
            tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={(value, name) =>
              name === "winRate"
                ? [pct(Number(value)), "Win rate"]
                : [value, name]
            }
            contentStyle={{
              background: "#07061a",
              border: "2px solid #ffd400",
            }}
          />
          <Line
            type="monotone"
            dataKey="winRate"
            stroke="#ffd400"
            strokeWidth={3}
            dot={{ r: 4, fill: "#ffd400" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
