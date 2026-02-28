/**
 * mealPlanUtils.ts — meal plan validation and normalisation.
 * Mirrored as normaliseMeal() in vanilla/app.js.
 */

export interface RawMeal {
  meal_type?: unknown;
  name?: unknown;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fats?: unknown;
  prep_time_min?: unknown;
  ingredients?: unknown;
}

export interface NormalisedMeal {
  meal_type: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  prep_time_min: number;
  ingredients: Array<{ name: string; amount?: string }>;
}

/** Returns null for structurally invalid meals (missing name). */
export function normaliseMeal(raw: RawMeal): NormalisedMeal | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;

  const ingredients: NormalisedMeal["ingredients"] = Array.isArray(raw.ingredients)
    ? (raw.ingredients as unknown[])
        .filter((i): i is { name: string; amount?: string } =>
          !!i && typeof i === "object" && typeof (i as Record<string, unknown>).name === "string"
        )
    : [];

  return {
    meal_type:     typeof raw.meal_type === "string" ? raw.meal_type : "snack",
    name:          (raw.name as string).trim(),
    calories:      Math.max(0, Number(raw.calories) || 0),
    protein:       Math.max(0, Number(raw.protein) || 0),
    carbs:         Math.max(0, Number(raw.carbs) || 0),
    fats:          Math.max(0, Number(raw.fats) || 0),
    prep_time_min: Math.max(0, Number(raw.prep_time_min) || 0),
    ingredients,
  };
}

export interface MealPlanResponse {
  meals?: unknown;
  error?: string;
}

export type ValidationResult =
  | { ok: true; meals: NormalisedMeal[] }
  | { ok: false; error: string };

/** Full response validation — returns typed result. */
export function validateMealPlanResponse(data: unknown): ValidationResult {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Received an unexpected response. Please try again." };
  }
  const d = data as MealPlanResponse;
  if (d.error) return { ok: false, error: d.error };
  if (!Array.isArray(d.meals) || d.meals.length === 0) {
    return { ok: false, error: "The AI returned an empty meal plan. Please try again." };
  }
  const meals = (d.meals as RawMeal[]).map(normaliseMeal).filter((m): m is NormalisedMeal => m !== null);
  if (meals.length === 0) {
    return { ok: false, error: "The AI returned meals with missing data. Please try again." };
  }
  return { ok: true, meals };
}
