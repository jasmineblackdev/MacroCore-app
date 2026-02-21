import { motion } from "framer-motion";
import { useProfile } from "@/context/ProfileContext";
import { Zap, ArrowRight, CheckCircle2 } from "lucide-react";

const Goals = () => {
  const { profile } = useProfile();

  const adjustments = [
    { week: "Week 3", change: "Calories reduced by 100", reason: "Adherence was high, weight stalled", applied: true },
    { week: "Week 2", change: "Protein increased to 165g", reason: "Based on body weight recalculation", applied: true },
    { week: "Week 1", change: "Initial targets set", reason: "Based on onboarding data", applied: true },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <motion.header className="px-5 pt-12 pb-4" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-display font-bold text-foreground">Goals</h1>
        <p className="text-sm text-muted-foreground">Auto-adjusted weekly</p>
      </motion.header>

      <div className="px-5 space-y-5">
        <motion.div className="bg-card rounded-2xl p-5 border border-border" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">Current Targets</h3>
          </div>
          <div className="text-center mb-4">
            <p className="text-4xl font-display font-bold text-foreground">{profile.calories}</p>
            <p className="text-sm text-muted-foreground">calories / day</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Protein", value: `${profile.protein}g`, color: "text-protein" },
              { label: "Carbs", value: `${profile.carbs}g`, color: "text-carbs" },
              { label: "Fats", value: `${profile.fats}g`, color: "text-fats" },
            ].map((macro) => (
              <div key={macro.label} className="bg-surface rounded-xl p-3 text-center">
                <p className={`text-xs font-medium ${macro.color}`}>{macro.label}</p>
                <p className="text-lg font-display font-bold text-foreground mt-1">{macro.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* How it works */}
        <motion.div className="bg-card rounded-2xl p-5 border border-border" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h3 className="text-sm font-medium text-foreground mb-3">How Adjustments Work</h3>
          <div className="space-y-3">
            {["Weekly check-in captures your weight", "7-day average compared to previous week", "Macros adjusted based on rate of change"].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">{i + 1}</span>
                </div>
                <p className="text-sm text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Adjustment history */}
        <motion.div className="bg-card rounded-2xl p-5 border border-border" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="text-sm font-medium text-foreground mb-3">Adjustment History</h3>
          <div className="space-y-3">
            {adjustments.map((adj, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{adj.week}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{adj.change}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{adj.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Goals;
