import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar } from "recharts";
import { TrendingDown, Calendar, Flame, Target } from "lucide-react";

const WEEKLY_WEIGHTS = [
  { week: "W1", avg: 185.2 },
  { week: "W2", avg: 184.0 },
  { week: "W3", avg: 182.8 },
  { week: "W4", avg: 181.5 },
];

const ADHERENCE_DATA = [
  { day: "Mon", pct: 95 },
  { day: "Tue", pct: 88 },
  { day: "Wed", pct: 102 },
  { day: "Thu", pct: 91 },
  { day: "Fri", pct: 78 },
  { day: "Sat", pct: 110 },
  { day: "Sun", pct: 96 },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.[0]) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs text-muted-foreground">{payload[0].payload.week || payload[0].payload.day}</p>
        <p className="text-sm font-display font-bold text-foreground">
          {payload[0].payload.avg ? `${payload[0].value} lbs` : `${payload[0].value}%`}
        </p>
      </div>
    );
  }
  return null;
};

const Progress = () => {
  const totalLost = WEEKLY_WEIGHTS[0].avg - WEEKLY_WEIGHTS[WEEKLY_WEIGHTS.length - 1].avg;

  return (
    <div className="min-h-screen bg-background pb-24">
      <motion.header
        className="px-5 pt-12 pb-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-xl font-display font-bold text-foreground">Progress</h1>
        <p className="text-sm text-muted-foreground">Your journey over time</p>
      </motion.header>

      <div className="px-5 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: TrendingDown, label: "Lost", value: `${totalLost.toFixed(1)} lbs`, color: "text-success" },
            { icon: Flame, label: "Streak", value: "12 days", color: "text-accent" },
            { icon: Calendar, label: "Duration", value: "4 weeks", color: "text-primary" },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              className="bg-card rounded-2xl p-3 border border-border text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <stat.icon className={`w-5 h-5 mx-auto mb-1 ${stat.color}`} />
              <p className="text-lg font-display font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Weight trend */}
        <motion.div
          className="bg-card rounded-2xl p-5 border border-border"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">Weight Trend</h3>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={WEEKLY_WEIGHTS}>
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Adherence */}
        <motion.div
          className="bg-card rounded-2xl p-5 border border-border"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-sm font-medium text-foreground mb-4">Calorie Adherence</h3>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ADHERENCE_DATA}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis hide domain={[0, 120]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">% of daily calorie target</p>
        </motion.div>
      </div>
    </div>
  );
};

export default Progress;
