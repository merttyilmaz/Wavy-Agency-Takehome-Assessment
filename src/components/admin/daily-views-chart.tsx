"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatNumber } from "@/lib/format";

// The base palette is a neutral scale whose lightest steps disappear on a
// light background; --chart-2 is the step that reads in both themes.
const config = {
  views: { label: "Views", color: "var(--chart-2)" },
} satisfies ChartConfig;

/**
 * Daily *new* views, not the cumulative total. Metric rows hold a running
 * total per submission, so the server turns them into per-day deltas and emits
 * a row for every day of the campaign period — days without a metric row come
 * back as 0 rather than as a gap.
 */
export function DailyViewsChart({
  data,
}: {
  data: { day: string; views: number }[];
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        The campaign period has not started yet.
      </p>
    );
  }

  const total = data.reduce((sum, point) => sum + point.views, 0);

  if (total === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No views recorded yet. Run <code>pnpm ingest</code> to pull metrics for
        approved submissions.
      </p>
    );
  }

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => formatNumber(value)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {/* Entry animation is off: with React 19 the bars can stay stuck at
            their first frame after the responsive container resizes. */}
        <Bar
          dataKey="views"
          fill="var(--color-views)"
          radius={2}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
