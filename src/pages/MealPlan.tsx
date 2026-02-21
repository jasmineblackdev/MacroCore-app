import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfile } from "@/context/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Clock, ChevronDown, ChevronUp, Loader2, UtensilsCrossed, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Ingredient {
  name: string;
  amount: string;
}

interface Meal {
  meal_type: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  ingredients: Ingredient[];
  prep_time_min: number;
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  morning_snack: "Morning Snack",
  lunch: "Lunch",
  afternoon_snack: "Afternoon Snack",
  dinner: "Dinner",
};

const MEAL_ORDER = ["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner"];

const MealCard = ({ meal }: { meal: Meal }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left p-4 flex items-center justify-between"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary uppercase tracking-wider">
              {MEAL_LABELS[meal.meal_type] || meal.meal_type}
            </p>
            <p className="font-semibold text-foreground mt-0.5 truncate">{meal.name}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-xs text-muted-foreground">{meal.calories} cal</span>
              <span className="text-xs text-macro-protein">{meal.protein}g P</span>
              <span className="text-xs text-macro-carbs">{meal.carbs}g C</span>
              <span className="text-xs text-macro-fats">{meal.fats}g F</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs">{meal.prep_time_min}m</span>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CardContent className="pt-0 pb-4">
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Ingredients</p>
                  <ul className="space-y-1">
                    {meal.ingredients.map((ing, i) => (
                      <li key={i} className="flex justify-between text-sm">
                        <span className="text-foreground">{ing.name}</span>
                        <span className="text-muted-foreground">{ing.amount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
};

const MealPlan = () => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState("");

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-meal-plan", {
        body: {
          calories: profile.calories,
          protein: profile.protein,
          carbs: profile.carbs,
          fats: profile.fats,
          preferences: preferences.trim() || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const sorted = (data.meals as Meal[]).sort(
        (a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type)
      );
      setMeals(sorted);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Failed to generate meal plan",
        description: e.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fats: acc.fats + m.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <motion.header className="px-5 pt-12 pb-2" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-display font-bold text-foreground">AI Meal Planner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {profile.calories} cal · {profile.protein}g P · {profile.carbs}g C · {profile.fats}g F
        </p>
      </motion.header>

      <div className="px-5 space-y-4">
        <div className="space-y-2">
          <Input
            placeholder="Preferences (e.g. vegetarian, no dairy, high protein...)"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            className="bg-card"
          />
          <Button onClick={generate} disabled={loading} className="w-full gap-2">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Meal Plan
              </>
            )}
          </Button>
        </div>

        {meals.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UtensilsCrossed className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">
              Tap generate to create a meal plan that hits your macro targets
            </p>
          </div>
        )}

        {meals.length > 0 && (
          <>
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Daily Total</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold">{Math.round(totals.calories)} cal</span>
                    <span className="text-xs text-macro-protein">{Math.round(totals.protein)}g P</span>
                    <span className="text-xs text-macro-carbs">{Math.round(totals.carbs)}g C</span>
                    <span className="text-xs text-macro-fats">{Math.round(totals.fats)}g F</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {meals.map((meal, i) => (
                <MealCard key={i} meal={meal} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MealPlan;
