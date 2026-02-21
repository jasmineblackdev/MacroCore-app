import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { calories, protein, carbs, fats, preferences } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const systemPrompt = `You are a nutrition expert meal planner. Generate a full day meal plan (breakfast, morning snack, lunch, afternoon snack, dinner) that hits the user's macro targets as closely as possible.

Rules:
- Use common, easy-to-find ingredients
- Include portion sizes in grams or standard measurements
- Each meal should list: name, calories, protein (g), carbs (g), fats (g), and ingredients with amounts
- The total for all meals MUST be within 5% of each target
- Keep meals practical and quick to prepare (under 30 min)
- Vary protein sources across meals

You MUST use the suggest_meal_plan tool to return your response.`;

    const userPrompt = `Generate a meal plan for these daily targets:
- Calories: ${calories} kcal
- Protein: ${protein}g
- Carbs: ${carbs}g
- Fats: ${fats}g
${preferences ? `\nPreferences: ${preferences}` : ""}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            name: "suggest_meal_plan",
            description: "Return a structured daily meal plan.",
            input_schema: {
              type: "object",
              properties: {
                meals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      meal_type: {
                        type: "string",
                        enum: [
                          "breakfast",
                          "morning_snack",
                          "lunch",
                          "afternoon_snack",
                          "dinner",
                        ],
                      },
                      name: { type: "string" },
                      calories: { type: "number" },
                      protein: { type: "number" },
                      carbs: { type: "number" },
                      fats: { type: "number" },
                      ingredients: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            amount: { type: "string" },
                          },
                          required: ["name", "amount"],
                        },
                      },
                      prep_time_min: { type: "number" },
                    },
                    required: [
                      "meal_type",
                      "name",
                      "calories",
                      "protein",
                      "carbs",
                      "fats",
                      "ingredients",
                      "prep_time_min",
                    ],
                  },
                },
              },
              required: ["meals"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "suggest_meal_plan" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("Anthropic API error:", response.status, text);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const toolUse = data.content?.find((block: { type: string }) => block.type === "tool_use");

    if (!toolUse?.input) {
      throw new Error("No meal plan returned from AI");
    }

    return new Response(JSON.stringify(toolUse.input), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-meal-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
