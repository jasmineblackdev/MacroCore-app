import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const WEIGHT_DATA = [
  { day: "Mon", weight: 182.4 },
  { day: "Tue", weight: 183.1 },
  { day: "Wed", weight: 181.8 },
  { day: "Thu", weight: 182.0 },
  { day: "Fri", weight: 181.2 },
  { day: "Sat", weight: 180.8 },
  { day: "Sun", weight: 180.5 },
];

const weeklyChange = WEIGHT_DATA[WEIGHT_DATA.length - 1].weight - WEIGHT_DATA[0].weight;
const avgWeight = (WEIGHT_DATA.reduce((s, d) => s + d.weight, 0) / WEIGHT_DATA.length).toFixed(1);

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.[0]) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs text-muted-foreground">{payload[0].payload.day}</p>
        <p className="text-sm font-display font-bold text-foreground">{payload[0].value} lbs</p>
      </div>
    );
  }
  return null;
};

export const WeeklyProgress = () => {
  const TrendIcon = weeklyChange < -0.3 ? TrendingDown : weeklyChange > 0.3 ? TrendingUp : Minus;
  const trendColor = weeklyChange < -0.3 ? "text-success" : weeklyChange > 0.3 ? "text-destructive" : "text-muted-foreground";
  const trendLabel = weeklyChange < -0.3 ? "On track" : weeklyChange > 0.3 ? "Trending up" : "Maintaining";

  return (
    <motion.div
      className="bg-card rounded-2xl p-5 border border-border"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">This Week</h3>
          <p className="text-2xl font-display font-bold text-foreground">{avgWeight} <span className="text-sm font-normal text-muted-foreground">lbs avg</span></p>
        </div>
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface text-xs font-medium ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          {trendLabel}
        </div>
      </div>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={WEIGHT_DATA}>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
            <YAxis
              domain={["dataMin - 1", "dataMax + 1"]}
              hide
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 3 }}
              activeDot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};
