import { useState } from "react";
import { motion } from "framer-motion";
import { useProfile } from "@/context/ProfileContext";
import { CalorieRing } from "@/components/CalorieRing";
import { QuickLog } from "@/components/QuickLog";
import { WeeklyProgress } from "@/components/WeeklyProgress";
import { TodayLog } from "@/components/TodayLog";
import { Zap } from "lucide-react";

interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  meal: string;
}

const Index = () => {
  const { profile } = useProfile();
  const [entries, setEntries] = useState<FoodEntry[]>([
    { id: "1", name: "Greek Yogurt", calories: 130, protein: 17, carbs: 6, fats: 4, meal: "breakfast" },
    { id: "2", name: "Banana", calories: 105, protein: 1.3, carbs: 27, fats: 0.4, meal: "breakfast" },
    { id: "3", name: "Chicken Breast", calories: 165, protein: 31, carbs: 0, fats: 3.6, meal: "lunch" },
    { id: "4", name: "Brown Rice (1 cup)", calories: 216, protein: 5, carbs: 45, fats: 1.8, meal: "lunch" },
  ]);

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fats: acc.fats + e.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  const handleLog = (entry: FoodEntry) => {
    setEntries((prev) => [...prev, entry]);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <motion.header className="px-5 pt-12 pb-2" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{greeting()}{profile.name ? `, ${profile.name}` : ""}</p>
            <h1 className="text-xl font-display font-bold text-foreground">Today's Target</h1>
          </div>
          <div className="flex items-center gap-1.5 bg-surface px-3 py-1.5 rounded-full">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">Week 4</span>
          </div>
        </div>
      </motion.header>

      <div className="px-5 space-y-5">
        <motion.div className="flex justify-center py-4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <CalorieRing
            current={Math.round(totals.calories)}
            target={profile.calories}
            protein={{ current: Math.round(totals.protein), target: profile.protein }}
            carbs={{ current: Math.round(totals.carbs), target: profile.carbs }}
            fats={{ current: Math.round(totals.fats), target: profile.fats }}
          />
        </motion.div>
        <WeeklyProgress />
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Today's Meals</h2>
          <TodayLog entries={entries} />
        </div>
      </div>
      <QuickLog onLog={handleLog} />
    </div>
  );
};

export default Index;
