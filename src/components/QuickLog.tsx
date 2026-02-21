import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, X, Utensils, Coffee, Moon, Sun } from "lucide-react";

interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  meal: string;
}

const QUICK_FOODS = [
  { name: "Chicken Breast", calories: 165, protein: 31, carbs: 0, fats: 3.6, emoji: "🍗" },
  { name: "Brown Rice (1 cup)", calories: 216, protein: 5, carbs: 45, fats: 1.8, emoji: "🍚" },
  { name: "Banana", calories: 105, protein: 1.3, carbs: 27, fats: 0.4, emoji: "🍌" },
  { name: "Greek Yogurt", calories: 130, protein: 17, carbs: 6, fats: 4, emoji: "🥛" },
  { name: "Eggs (2 large)", calories: 143, protein: 13, carbs: 1, fats: 10, emoji: "🥚" },
  { name: "Avocado (half)", calories: 120, protein: 1.5, carbs: 6, fats: 11, emoji: "🥑" },
  { name: "Salmon Fillet", calories: 208, protein: 20, carbs: 0, fats: 13, emoji: "🐟" },
  { name: "Oatmeal (1 cup)", calories: 154, protein: 5, carbs: 27, fats: 2.6, emoji: "🥣" },
];

const MEALS = [
  { id: "breakfast", label: "Breakfast", icon: Coffee },
  { id: "lunch", label: "Lunch", icon: Sun },
  { id: "dinner", label: "Dinner", icon: Moon },
  { id: "snack", label: "Snack", icon: Utensils },
];

interface QuickLogProps {
  onLog: (entry: FoodEntry) => void;
}

export const QuickLog = ({ onLog }: QuickLogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMeal, setSelectedMeal] = useState("lunch");

  const filtered = QUICK_FOODS.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleLog = (food: typeof QUICK_FOODS[0]) => {
    onLog({
      id: Date.now().toString(),
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fats: food.fats,
      meal: selectedMeal,
    });
  };

  return (
    <>
      {/* FAB */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg glow-primary z-40"
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      {/* Bottom sheet */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-3xl z-50 max-h-[80vh] overflow-hidden flex flex-col"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              {/* Header */}
              <div className="px-5 pb-3 flex items-center justify-between">
                <h3 className="text-lg font-display font-semibold text-foreground">Log Food</h3>
                <button onClick={() => setIsOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Meal selector */}
              <div className="px-5 pb-3 flex gap-2">
                {MEALS.map(meal => (
                  <button
                    key={meal.id}
                    onClick={() => setSelectedMeal(meal.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedMeal === meal.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <meal.icon className="w-3.5 h-3.5" />
                    {meal.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="px-5 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search foods..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {/* Food list */}
              <div className="flex-1 overflow-y-auto px-5 pb-6">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Quick Add</p>
                <div className="space-y-2">
                  {filtered.map((food) => (
                    <motion.button
                      key={food.name}
                      onClick={() => handleLog(food)}
                      className="w-full flex items-center gap-3 p-3 bg-surface rounded-xl hover:bg-muted transition-colors text-left"
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="text-2xl">{food.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{food.name}</p>
                        <p className="text-xs text-muted-foreground">
                          P: {food.protein}g · C: {food.carbs}g · F: {food.fats}g
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-display font-semibold text-foreground">{food.calories}</p>
                        <p className="text-xs text-muted-foreground">cal</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
