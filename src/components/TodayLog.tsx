import { motion } from "framer-motion";
import { Clock } from "lucide-react";

interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  meal: string;
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "☀️ Breakfast",
  lunch: "🌤️ Lunch",
  dinner: "🌙 Dinner",
  snack: "🍿 Snack",
};

interface TodayLogProps {
  entries: FoodEntry[];
}

export const TodayLog = ({ entries }: TodayLogProps) => {
  const grouped = entries.reduce((acc, entry) => {
    if (!acc[entry.meal]) acc[entry.meal] = [];
    acc[entry.meal].push(entry);
    return acc;
  }, {} as Record<string, FoodEntry[]>);

  if (entries.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-5 border border-border text-center">
        <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No meals logged yet today</p>
        <p className="text-xs text-muted-foreground mt-1">Tap + to log your first meal</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([meal, items]) => (
        <motion.div
          key={meal}
          className="bg-card rounded-2xl p-4 border border-border"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {MEAL_LABELS[meal] || meal}
          </p>
          <div className="space-y-2">
            {items.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{entry.name}</span>
                <span className="text-sm font-display font-semibold text-foreground">{entry.calories} cal</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-border flex gap-3 text-xs text-muted-foreground">
            <span className="text-protein">P: {items.reduce((s, e) => s + e.protein, 0)}g</span>
            <span className="text-carbs">C: {items.reduce((s, e) => s + e.carbs, 0)}g</span>
            <span className="text-fats">F: {items.reduce((s, e) => s + e.fats, 0)}g</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
