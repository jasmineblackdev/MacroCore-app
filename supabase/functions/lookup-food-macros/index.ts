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
    const { description } = await req.json();
    if (!description) throw new Error("No food description provided");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: `You are a nutrition database. Given any food description, return accurate macro data.
Be precise with common foods. For restaurant items use typical values. For vague descriptions make reasonable assumptions.
Always return values for the exact portion described — not per 100g.`,
        messages: [{ role: "user", content: `Look up the macros for: ${description}` }],
        tools: [
          {
            name: "return_macros",
            description: "Return the nutritional macros for the described food and portion.",
            input_schema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Clean, properly capitalised food name with portion (e.g. '2 Scrambled Eggs')",
                },
                calories: { type: "number", description: "Total calories (kcal)" },
                protein:  { type: "number", description: "Protein in grams" },
                carbs:    { type: "number", description: "Total carbohydrates in grams" },
                fats:     { type: "number", description: "Total fat in grams" },
              },
              required: ["name", "calories", "protein", "carbs", "fats"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "return_macros" },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Anthropic error:", response.status, text);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const toolUse = data.content?.find((b: { type: string }) => b.type === "tool_use");
    if (!toolUse?.input) throw new Error("No macro data returned");

    return new Response(JSON.stringify(toolUse.input), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lookup-food-macros error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
