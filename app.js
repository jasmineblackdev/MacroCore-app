// ============================================================
// MacroCore — Vanilla JS Application
// ============================================================

(function () {
  "use strict";

  // ── Supabase config ──────────────────────────────────────
  const SUPABASE_URL = "https://rxnqjdclqyazferbseeq.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4bnFqZGNscXlhemZlcmJzZWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODQ5NjcsImV4cCI6MjA4Njg2MDk2N30.MA1qhu_gU93MjoDiJsM2FFDlO2iYjSk_kAbwf0rx_9g";

  // Initialize Supabase client
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Default Profile ──────────────────────────────────────
  const DEFAULT_PROFILE = {
    name: "",
    age: 30,
    sex: "male",
    heightFt: 5,
    heightIn: 10,
    weight: 180,
    activityLevel: "moderate",
    goal: "lose",
    rate: 1,
    units: "imperial",
    reminderEnabled: true,
    reminderTime: "12:00",
    weighInReminderEnabled: true,
    weighInDay: "monday",
    onboarded: false,
    startedAt: null,
    calories: 2200,
    protein: 165,
    carbs: 220,
    fats: 73,
    exclusions: [],
  };

  // ══════════════════════════════════════════════════════════
  // CACHE LAYER (localStorage)
  // ══════════════════════════════════════════════════════════

  function cacheSet(key, data) {
    try {
      localStorage.setItem("mc_" + key, JSON.stringify({ data: data, ts: Date.now() }));
    } catch (_) { /* quota exceeded — silently fail */ }
  }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem("mc_" + key);
      if (!raw) return null;
      return JSON.parse(raw).data;
    } catch (_) { return null; }
  }

  function cacheRemove(key) {
    localStorage.removeItem("mc_" + key);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  // ── State ────────────────────────────────────────────────
  let currentUser = null;
  let profile = { ...DEFAULT_PROFILE };
  let foodEntries = [];
  let weightLogs = []; // { date, weight }
  let mealPlanMeals = [];
  let savedMealPlanId = null;
  let adjustments = []; // { created_at, prev_calories, new_calories, ... reason }
  let macroExpanded = false;
  let quickLogOpen = false;
  let selectedMeal = "lunch";
  let mealPlanLoading = false;

  // ── Quick Foods DB ───────────────────────────────────────
  // Macros per 100g for accurate serving-size calculation
  const QUICK_FOODS = [
    { name: "Chicken Breast", cal100: 165, p100: 31, c100: 0, f100: 3.6, serving: 100, unit: "g", emoji: "🍗" },
    { name: "Brown Rice (cooked)", cal100: 130, p100: 2.7, c100: 28, f100: 1, serving: 195, unit: "g", emoji: "🍚" },
    { name: "Banana", cal100: 89, p100: 1.1, c100: 23, f100: 0.3, serving: 118, unit: "g", emoji: "🍌" },
    { name: "Greek Yogurt", cal100: 59, p100: 10, c100: 3.6, f100: 0.4, serving: 227, unit: "g", emoji: "🥛" },
    { name: "Eggs", cal100: 155, p100: 13, c100: 1.1, f100: 11, serving: 100, unit: "g", emoji: "🥚" },
    { name: "Avocado", cal100: 160, p100: 2, c100: 8.5, f100: 14.7, serving: 75, unit: "g", emoji: "🥑" },
    { name: "Salmon Fillet", cal100: 208, p100: 20, c100: 0, f100: 13, serving: 113, unit: "g", emoji: "🐟" },
    { name: "Oatmeal (dry)", cal100: 389, p100: 16.9, c100: 66, f100: 6.9, serving: 40, unit: "g", emoji: "🥣" },
    { name: "Sweet Potato", cal100: 86, p100: 1.6, c100: 20, f100: 0.1, serving: 130, unit: "g", emoji: "🍠" },
    { name: "Ground Beef (lean)", cal100: 250, p100: 26, c100: 0, f100: 15, serving: 113, unit: "g", emoji: "🥩" },
    { name: "White Rice (cooked)", cal100: 130, p100: 2.7, c100: 28, f100: 0.3, serving: 195, unit: "g", emoji: "🍚" },
    { name: "Bread (whole wheat)", cal100: 247, p100: 13, c100: 41, f100: 3.4, serving: 28, unit: "g", emoji: "🍞" },
    { name: "Pasta (cooked)", cal100: 131, p100: 5, c100: 25, f100: 1.1, serving: 140, unit: "g", emoji: "🍝" },
    { name: "Broccoli", cal100: 34, p100: 2.8, c100: 7, f100: 0.4, serving: 91, unit: "g", emoji: "🥦" },
    { name: "Almonds", cal100: 579, p100: 21, c100: 22, f100: 49.9, serving: 28, unit: "g", emoji: "🥜" },
    { name: "Protein Shake", cal100: 400, p100: 75, c100: 13, f100: 6, serving: 32, unit: "g", emoji: "🥤" },
  ];

  function calcFoodMacros(food, amount) {
    var ratio = amount / 100;
    return {
      calories: Math.round(food.cal100 * ratio),
      protein: Math.round(food.p100 * ratio * 10) / 10,
      carbs: Math.round(food.c100 * ratio * 10) / 10,
      fats: Math.round(food.f100 * ratio * 10) / 10,
    };
  }

  const MEALS = [
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "dinner", label: "Dinner" },
    { id: "snack", label: "Snack" },
  ];

  const MEAL_LABELS = {
    breakfast: "☀️ Breakfast",
    lunch: "🌤️ Lunch",
    dinner: "🌙 Dinner",
    snack: "🍿 Snack",
  };

  const MEAL_PLAN_ORDER = ["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner"];
  const MEAL_PLAN_LABELS = {
    breakfast: "Breakfast",
    morning_snack: "Morning Snack",
    lunch: "Lunch",
    afternoon_snack: "Afternoon Snack",
    dinner: "Dinner",
  };

  // ══════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════

  let authMode = "signin"; // "signin" | "signup"

  function showAuth() {
    document.getElementById("auth-overlay").classList.remove("hidden");
    document.getElementById("onboarding").style.display = "none";
    document.getElementById("bottom-nav").style.display = "none";
  }

  function hideAuth() {
    document.getElementById("auth-overlay").classList.add("hidden");
  }

  function toggleAuthMode() {
    authMode = authMode === "signin" ? "signup" : "signin";
    document.getElementById("auth-title").textContent =
      authMode === "signin" ? "Welcome to MacroCore" : "Create Account";
    document.getElementById("auth-subtitle").textContent =
      authMode === "signin" ? "Sign in to sync your data across devices" : "Sign up to get started";
    document.getElementById("auth-submit").textContent =
      authMode === "signin" ? "Sign In" : "Sign Up";
    document.getElementById("auth-toggle-text").textContent =
      authMode === "signin" ? "Don't have an account?" : "Already have an account?";
    document.getElementById("auth-toggle-btn").textContent =
      authMode === "signin" ? "Sign Up" : "Sign In";
    document.getElementById("auth-error").style.display = "none";
  }

  function showAuthError(msg) {
    var el = document.getElementById("auth-error");
    el.textContent = msg;
    el.style.display = "block";
    el.style.background = "hsl(var(--destructive) / 0.1)";
    el.style.color = "hsl(var(--destructive))";
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const btn = document.getElementById("auth-submit");
    btn.disabled = true;
    btn.textContent = authMode === "signin" ? "Signing in..." : "Creating account...";
    document.getElementById("auth-error").style.display = "none";

    try {
      let result;
      if (authMode === "signup") {
        result = await supabase.auth.signUp({ email: email, password: password });
        if (result.error) throw result.error;
        // Check if email confirmation is required
        if (result.data.user && !result.data.session) {
          // Email confirmation needed — auto sign in instead
          // (Supabase created the user but requires confirmation)
          // Try signing in directly in case confirm is disabled
          var signInResult = await supabase.auth.signInWithPassword({ email: email, password: password });
          if (signInResult.error) {
            // Confirmation IS required — show message and switch to sign-in mode
            showAuthSuccess("Account created! Check your email to confirm, then sign in.");
            btn.disabled = false;
            // Directly set sign-in mode (don't use toggleAuthMode which would flip it)
            authMode = "signin";
            document.getElementById("auth-title").textContent = "Welcome to MacroCore";
            document.getElementById("auth-subtitle").textContent = "Sign in to sync your data across devices";
            btn.textContent = "Sign In";
            document.getElementById("auth-toggle-text").textContent = "Don't have an account?";
            document.getElementById("auth-toggle-btn").textContent = "Sign Up";
            return;
          }
          // If sign-in worked, onAuthStateChange will handle the rest
        }
      } else {
        result = await supabase.auth.signInWithPassword({ email: email, password: password });
        if (result.error) throw result.error;
      }
      // onAuthStateChange will handle the rest
    } catch (err) {
      showAuthError(err.message || "Authentication failed");
      btn.disabled = false;
      btn.textContent = authMode === "signin" ? "Sign In" : "Sign Up";
    }
  }

  function showAuthSuccess(msg) {
    var el = document.getElementById("auth-error");
    el.textContent = msg;
    el.style.display = "block";
    el.style.background = "hsl(var(--success) / 0.1)";
    el.style.color = "hsl(var(--success))";
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    currentUser = null;
    profile = { ...DEFAULT_PROFILE };
    foodEntries = [];
    weightLogs = [];
    mealPlanMeals = [];
    adjustments = [];
    // Clear all cached data
    Object.keys(localStorage).forEach(function (key) {
      if (key.startsWith("mc_")) localStorage.removeItem(key);
    });
    showAuth();
  }

  async function handleDeleteAccount() {
    if (!currentUser) return;
    var confirmed = window.confirm(
      "Are you sure you want to delete your account? This will permanently erase all your data and cannot be undone."
    );
    if (!confirmed) return;

    var doubleConfirm = window.confirm(
      "This is irreversible. All your profile, food logs, weight history, meal plans, and adjustment history will be deleted forever. Continue?"
    );
    if (!doubleConfirm) return;

    try {
      var uid = currentUser.id;
      // Delete all user data from tables
      await Promise.all([
        supabase.from("food_entries").delete().eq("user_id", uid),
        supabase.from("weight_logs").delete().eq("user_id", uid),
        supabase.from("meal_plans").delete().eq("user_id", uid),
        supabase.from("adjustments").delete().eq("user_id", uid),
        supabase.from("profiles").delete().eq("id", uid),
      ]);

      // Delete auth account via RPC (requires the delete_own_account function)
      await supabase.rpc("delete_own_account");

      // Clear local state
      currentUser = null;
      profile = { ...DEFAULT_PROFILE };
      foodEntries = [];
      weightLogs = [];
      mealPlanMeals = [];
      adjustments = [];
      Object.keys(localStorage).forEach(function (key) {
        if (key.startsWith("mc_")) localStorage.removeItem(key);
      });

      await supabase.auth.signOut();
      showAuth();
    } catch (err) {
      console.error("Account deletion error:", err);
      alert("Failed to delete account: " + (err.message || "Unknown error. Please try again."));
    }
  }

  // ══════════════════════════════════════════════════════════
  // PROFILE / MACRO CALCULATOR
  // ══════════════════════════════════════════════════════════

  function loadProfileFromCache() {
    const cached = cacheGet("profile");
    if (cached) return { ...DEFAULT_PROFILE, ...cached };
    return { ...DEFAULT_PROFILE };
  }

  function saveProfile() {
    cacheSet("profile", profile);
    syncProfileToSupabase();
  }

  function updateProfile(updates) {
    Object.assign(profile, updates);
    saveProfile();
  }

  async function syncProfileToSupabase() {
    if (!currentUser) return;
    try {
      await supabase.from("profiles").upsert({
        id: currentUser.id,
        name: profile.name,
        age: profile.age,
        sex: profile.sex,
        height_ft: profile.heightFt,
        height_in: profile.heightIn,
        weight: profile.weight,
        activity_level: profile.activityLevel,
        goal: profile.goal,
        rate: profile.rate,
        calories: profile.calories,
        protein: profile.protein,
        carbs: profile.carbs,
        fats: profile.fats,
        units: profile.units,
        reminder_enabled: profile.reminderEnabled,
        reminder_time: profile.reminderTime,
        weigh_in_reminder_enabled: profile.weighInReminderEnabled,
        weigh_in_day: profile.weighInDay,
        onboarded: profile.onboarded,
        started_at: profile.startedAt || null,
        exclusions: profile.exclusions || [],
        updated_at: new Date().toISOString(),
      });
    } catch (_) { /* silent */ }
  }

  async function loadProfileFromSupabase() {
    if (!currentUser) return;
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", currentUser.id).single();
      if (data) {
        profile = {
          ...DEFAULT_PROFILE,
          name: data.name || "",
          age: data.age || 30,
          sex: data.sex || "male",
          heightFt: data.height_ft || 5,
          heightIn: data.height_in || 10,
          weight: data.weight || 180,
          activityLevel: data.activity_level || "moderate",
          goal: data.goal || "lose",
          rate: data.rate || 1,
          calories: data.calories || 2200,
          protein: data.protein || 165,
          carbs: data.carbs || 220,
          fats: data.fats || 73,
          units: data.units || "imperial",
          reminderEnabled: data.reminder_enabled !== false,
          reminderTime: data.reminder_time || "12:00",
          weighInReminderEnabled: data.weigh_in_reminder_enabled !== false,
          weighInDay: data.weigh_in_day || "monday",
          onboarded: data.onboarded || false,
          startedAt: data.started_at || null,
          exclusions: data.exclusions || [],
        };
        cacheSet("profile", profile);
      }
    } catch (_) { /* use cached */ }
  }

  function calculateMacros(p) {
    var age = p.age, sex = p.sex, heightFt = p.heightFt, heightIn = p.heightIn, weight = p.weight, activityLevel = p.activityLevel, goal = p.goal, rate = p.rate;
    var heightCm = (heightFt * 12 + heightIn) * 2.54;
    var weightKg = weight * 0.453592;
    var bmr;
    if (sex === "male") {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    } else {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    }
    var multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
    var tdee = bmr * multipliers[activityLevel];
    if (goal === "lose") tdee -= rate * 500;
    else if (goal === "gain") tdee += rate * 250;
    var calories = Math.round(Math.max(tdee, 1200));
    var protein = Math.round(Math.max(weightKg * 2.0, 50));
    var fats = Math.round(Math.max((calories * 0.25) / 9, 30));
    var carbs = Math.round(Math.max((calories - protein * 4 - fats * 9) / 4, 50));
    return { calories: calories, protein: protein, carbs: carbs, fats: fats };
  }

  function recalculate() {
    var oldMacros = { calories: profile.calories, protein: profile.protein, carbs: profile.carbs, fats: profile.fats };
    var macros = calculateMacros(profile);
    updateProfile(macros);

    // Record adjustment if macros changed
    if (oldMacros.calories !== macros.calories || oldMacros.protein !== macros.protein) {
      addAdjustment(oldMacros, macros, "Manual recalculation from settings");
    }
  }

  // ══════════════════════════════════════════════════════════
  // FOOD ENTRIES PERSISTENCE
  // ══════════════════════════════════════════════════════════

  function cacheFoodEntries() {
    cacheSet("food_" + todayStr(), foodEntries);
  }

  function loadFoodEntriesFromCache() {
    var cached = cacheGet("food_" + todayStr());
    foodEntries = cached || [];
  }

  async function syncFoodEntriesToSupabase() {
    if (!currentUser) return;
    try {
      // Delete today's entries and re-insert all
      var today = todayStr();
      await supabase.from("food_entries").delete().eq("user_id", currentUser.id).eq("logged_at", today);
      if (foodEntries.length > 0) {
        await supabase.from("food_entries").insert(
          foodEntries.map(function (e) {
            return {
              id: e.id,
              user_id: currentUser.id,
              name: e.name,
              calories: e.calories,
              protein: e.protein,
              carbs: e.carbs,
              fats: e.fats,
              meal: e.meal,
              logged_at: today,
            };
          })
        );
      }
    } catch (_) { /* silent */ }
  }

  async function loadFoodEntriesFromSupabase() {
    if (!currentUser) return;
    try {
      var today = todayStr();
      var { data } = await supabase.from("food_entries")
        .select("*")
        .eq("user_id", currentUser.id)
        .eq("logged_at", today)
        .order("created_at", { ascending: true });
      if (data && data.length > 0) {
        foodEntries = data.map(function (row) {
          return {
            id: row.id,
            name: row.name,
            calories: row.calories,
            protein: row.protein,
            carbs: row.carbs,
            fats: row.fats,
            meal: row.meal,
          };
        });
        cacheFoodEntries();
      }
    } catch (_) { /* use cached */ }
  }

  function addFoodEntry(food, meal) {
    var entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString(36).slice(2),
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fats: food.fats,
      meal: meal,
    };
    foodEntries.push(entry);
    cacheFoodEntries();
    syncFoodEntriesToSupabase();
    return entry;
  }

  function deleteFoodEntry(id) {
    foodEntries = foodEntries.filter(function (e) { return e.id !== id; });
    cacheFoodEntries();
    syncFoodEntriesToSupabase();
  }

  // ══════════════════════════════════════════════════════════
  // WEIGHT LOG PERSISTENCE
  // ══════════════════════════════════════════════════════════

  function cacheWeightLogs() {
    cacheSet("weights", weightLogs);
  }

  function loadWeightLogsFromCache() {
    var cached = cacheGet("weights");
    weightLogs = cached || [];
  }

  async function syncWeightLogToSupabase(entry) {
    if (!currentUser) return;
    try {
      // Upsert by date
      await supabase.from("weight_logs").upsert({
        id: entry.id,
        user_id: currentUser.id,
        weight: entry.weight,
        logged_at: entry.date,
      });
    } catch (_) { /* silent */ }
  }

  async function loadWeightLogsFromSupabase() {
    if (!currentUser) return;
    try {
      var { data } = await supabase.from("weight_logs")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("logged_at", { ascending: true });
      if (data && data.length > 0) {
        weightLogs = data.map(function (row) {
          return { id: row.id, date: row.logged_at, weight: row.weight };
        });
        cacheWeightLogs();
      }
    } catch (_) { /* use cached */ }
  }

  function logWeight(weight) {
    var today = todayStr();
    var existing = weightLogs.find(function (w) { return w.date === today; });
    if (existing) {
      existing.weight = weight;
    } else {
      var entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        date: today,
        weight: weight,
      };
      weightLogs.push(entry);
    }
    cacheWeightLogs();
    var toSync = weightLogs.find(function (w) { return w.date === today; });
    syncWeightLogToSupabase(toSync);
  }

  // ══════════════════════════════════════════════════════════
  // MEAL PLAN PERSISTENCE
  // ══════════════════════════════════════════════════════════

  function cacheMealPlan() {
    cacheSet("meal_plan", { meals: mealPlanMeals, id: savedMealPlanId });
  }

  function loadMealPlanFromCache() {
    var cached = cacheGet("meal_plan");
    if (cached) {
      mealPlanMeals = cached.meals || [];
      savedMealPlanId = cached.id || null;
    }
  }

  async function saveMealPlanToSupabase(prefs) {
    if (!currentUser) return;
    try {
      var payload = {
        user_id: currentUser.id,
        preferences: prefs || "",
        meals: mealPlanMeals,
      };
      if (savedMealPlanId) {
        await supabase.from("meal_plans").update(payload).eq("id", savedMealPlanId);
      } else {
        var { data } = await supabase.from("meal_plans").insert(payload).select("id").single();
        if (data) savedMealPlanId = data.id;
      }
      cacheMealPlan();
    } catch (_) { /* silent */ }
  }

  async function loadMealPlanFromSupabase() {
    if (!currentUser) return;
    try {
      var { data } = await supabase.from("meal_plans")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data) {
        mealPlanMeals = data.meals || [];
        savedMealPlanId = data.id;
        cacheMealPlan();
      }
    } catch (_) { /* use cached */ }
  }

  // ══════════════════════════════════════════════════════════
  // ADJUSTMENT HISTORY PERSISTENCE
  // ══════════════════════════════════════════════════════════

  function cacheAdjustments() {
    cacheSet("adjustments", adjustments);
  }

  function loadAdjustmentsFromCache() {
    var cached = cacheGet("adjustments");
    adjustments = cached || [];
  }

  function addAdjustment(oldMacros, newMacros, reason) {
    var adj = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      created_at: new Date().toISOString(),
      prev_calories: oldMacros.calories,
      new_calories: newMacros.calories,
      prev_protein: oldMacros.protein,
      new_protein: newMacros.protein,
      prev_carbs: oldMacros.carbs,
      new_carbs: newMacros.carbs,
      prev_fats: oldMacros.fats,
      new_fats: newMacros.fats,
      reason: reason,
    };
    adjustments.push(adj);
    cacheAdjustments();
    syncAdjustmentToSupabase(adj);
  }

  async function syncAdjustmentToSupabase(adj) {
    if (!currentUser) return;
    try {
      await supabase.from("adjustments").insert({
        id: adj.id,
        user_id: currentUser.id,
        prev_calories: adj.prev_calories,
        new_calories: adj.new_calories,
        prev_protein: adj.prev_protein,
        new_protein: adj.new_protein,
        prev_carbs: adj.prev_carbs,
        new_carbs: adj.new_carbs,
        prev_fats: adj.prev_fats,
        new_fats: adj.new_fats,
        reason: adj.reason,
      });
    } catch (_) { /* silent */ }
  }

  async function loadAdjustmentsFromSupabase() {
    if (!currentUser) return;
    try {
      var { data } = await supabase.from("adjustments")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true });
      if (data && data.length > 0) {
        adjustments = data.map(function (row) {
          return {
            id: row.id,
            created_at: row.created_at,
            prev_calories: row.prev_calories,
            new_calories: row.new_calories,
            prev_protein: row.prev_protein,
            new_protein: row.new_protein,
            prev_carbs: row.prev_carbs,
            new_carbs: row.new_carbs,
            prev_fats: row.prev_fats,
            new_fats: row.new_fats,
            reason: row.reason,
          };
        });
        cacheAdjustments();
      }
    } catch (_) { /* use cached */ }
  }

  // ══════════════════════════════════════════════════════════
  // THEME
  // ══════════════════════════════════════════════════════════

  function getTheme() {
    return localStorage.getItem("macrocore_theme") || "light";
  }

  function setTheme(t) {
    localStorage.setItem("macrocore_theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }

  // ══════════════════════════════════════════════════════════
  // ROUTER
  // ══════════════════════════════════════════════════════════

  var PAGES = ["home", "meals", "progress", "goals", "settings"];

  function navigate(page) {
    if (!PAGES.includes(page)) page = "home";
    window.location.hash = page;
  }

  function handleRoute() {
    var hash = window.location.hash.slice(1) || "home";
    var page = PAGES.includes(hash) ? hash : "home";

    PAGES.forEach(function (p) {
      var el = document.getElementById("page-" + p);
      if (el) el.classList.toggle("active", p === page);
    });

    document.querySelectorAll(".nav-item").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.page === page);
    });

    try { if (page === "home") renderHome(); } catch(e) { console.error("renderHome error:", e); }
    try { if (page === "meals") renderMeals(); } catch(e) { console.error("renderMeals error:", e); }
    try { if (page === "progress") renderProgress(); } catch(e) { console.error("renderProgress error:", e); }
    try { if (page === "goals") renderGoals(); } catch(e) { console.error("renderGoals error:", e); }
    try { if (page === "settings") renderSettings(); } catch(e) { console.error("renderSettings error:", e); }
  }

  // ══════════════════════════════════════════════════════════
  // ONBOARDING
  // ══════════════════════════════════════════════════════════

  var OB_STEPS = ["welcome", "basics", "body", "activity", "goal", "results"];
  var obStep = 0;

  function showOnboarding() {
    var el = document.getElementById("onboarding");
    el.style.display = "flex";
    el.classList.remove("hidden");
    document.getElementById("bottom-nav").style.display = "none";
    obStep = 0;
    renderObStep();
  }

  function hideOnboarding() {
    var el = document.getElementById("onboarding");
    el.classList.add("hidden");
    setTimeout(function () { el.style.display = "none"; }, 300);
    document.getElementById("bottom-nav").style.display = "";
    handleRoute();
  }

  function renderObStep() {
    var stepName = OB_STEPS[obStep];
    var progBar = document.getElementById("onboarding-progress");
    progBar.style.display = stepName === "welcome" ? "none" : "flex";

    for (var i = 1; i <= 5; i++) {
      document.getElementById("prog-" + i).classList.toggle("filled", i <= obStep);
    }

    OB_STEPS.forEach(function (s) {
      var stepEl = document.getElementById("step-" + s);
      if (stepEl) stepEl.classList.toggle("active", s === stepName);
    });

    if (stepName === "basics") {
      document.getElementById("ob-name").value = profile.name;
      document.getElementById("ob-age").value = profile.age;
      document.querySelectorAll(".sex-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.sex === profile.sex); });
      updateBasicsBtn();
    }
    if (stepName === "body") {
      document.getElementById("ob-height-ft").value = profile.heightFt;
      document.getElementById("ob-height-in").value = profile.heightIn;
      document.getElementById("ob-weight").value = profile.weight;
    }
    if (stepName === "activity") {
      document.querySelectorAll("#activity-options .selection-btn").forEach(function (b) {
        b.classList.toggle("selected", b.dataset.activity === profile.activityLevel);
      });
    }
    if (stepName === "goal") {
      document.querySelectorAll("#goal-options .selection-btn").forEach(function (b) {
        b.classList.toggle("selected", b.dataset.goal === profile.goal);
      });
      document.querySelectorAll(".rate-btn").forEach(function (b) {
        b.classList.toggle("selected", parseFloat(b.dataset.rate) === profile.rate);
      });
      document.getElementById("rate-display").textContent = profile.rate;
      var rateSection = document.getElementById("rate-section");
      rateSection.style.display = profile.goal === "maintain" ? "none" : "";
      document.getElementById("rate-hint").textContent =
        profile.goal === "lose"
          ? "0.5-1 lb/week is recommended for sustainable loss"
          : "0.5-1 lb/week is ideal for lean gains";
    }
    if (stepName === "results") {
      var m = calculateMacros(profile);
      document.getElementById("result-calories").textContent = m.calories;
      document.getElementById("result-protein").textContent = m.protein + "g";
      document.getElementById("result-carbs").textContent = m.carbs + "g";
      document.getElementById("result-fats").textContent = m.fats + "g";
    }
  }

  function obNext() {
    if (obStep < OB_STEPS.length - 1) {
      obStep++;
      renderObStep();
    }
  }

  function obBack() {
    if (obStep > 0) {
      obStep--;
      renderObStep();
    }
  }

  function updateBasicsBtn() {
    var name = document.getElementById("ob-name").value.trim();
    document.getElementById("btn-basics-next").disabled = !name;
  }

  // ══════════════════════════════════════════════════════════
  // HOME PAGE
  // ══════════════════════════════════════════════════════════

  function getCurrentWeek() {
    if (!profile.startedAt) return 1;
    var start = new Date(profile.startedAt);
    var now = new Date();
    var diffMs = now - start;
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.floor(diffDays / 7) + 1);
  }

  function updateWeekBadge() {
    var el = document.getElementById("week-badge-text");
    if (el) el.textContent = "Week " + getCurrentWeek();
  }

  function renderHome() {
    updateGreeting();
    updateWeekBadge();
    updateCalorieRing();
    renderWeeklyChart();
    renderTodayLog();
  }

  function updateGreeting() {
    var h = new Date().getHours();
    var g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    if (profile.name) g += ", " + profile.name;
    document.getElementById("greeting-text").textContent = g;
  }

  function getTotals() {
    return foodEntries.reduce(
      function (acc, e) {
        return {
          calories: acc.calories + e.calories,
          protein: acc.protein + e.protein,
          carbs: acc.carbs + e.carbs,
          fats: acc.fats + e.fats,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }

  function updateCalorieRing() {
    var totals = getTotals();
    var current = Math.round(totals.calories);
    var target = profile.calories;
    var pct = Math.min((current / target) * 100, 100);
    var circumference = 2 * Math.PI * 45;
    var offset = circumference - (pct / 100) * circumference;

    document.getElementById("calorie-ring-circle").setAttribute("stroke-dashoffset", offset);
    document.getElementById("ring-current").textContent = current.toLocaleString();
    document.getElementById("ring-target").textContent = "of " + target.toLocaleString() + " cal";

    var remaining = target - current;
    document.getElementById("ring-remaining").textContent =
      remaining > 0 ? remaining + " cal remaining" : "Goal reached! 🎉";

    document.getElementById("macro-p-tar").textContent = profile.protein;
    document.getElementById("macro-c-tar").textContent = profile.carbs;
    document.getElementById("macro-f-tar").textContent = profile.fats;

    document.getElementById("macro-p-cur").textContent = Math.round(totals.protein);
    document.getElementById("macro-c-cur").textContent = Math.round(totals.carbs);
    document.getElementById("macro-f-cur").textContent = Math.round(totals.fats);

    var pP = Math.min((totals.protein / profile.protein) * 100, 100);
    var pC = Math.min((totals.carbs / profile.carbs) * 100, 100);
    var pF = Math.min((totals.fats / profile.fats) * 100, 100);
    document.getElementById("macro-p-bar").style.width = pP + "%";
    document.getElementById("macro-c-bar").style.width = pC + "%";
    document.getElementById("macro-f-bar").style.width = pF + "%";
  }

  function toggleMacroBreakdown() {
    macroExpanded = !macroExpanded;
    document.getElementById("macro-breakdown").classList.toggle("open", macroExpanded);
    document.getElementById("ring-chevron").classList.toggle("expanded", macroExpanded);
  }

  // ── Weekly Chart (SVG) ───────────────────────────────────

  function renderWeeklyChart() {
    var container = document.getElementById("weekly-chart");

    // Use last 7 weight logs, or show placeholder
    var data;
    if (weightLogs.length >= 2) {
      var last7 = weightLogs.slice(-7);
      data = last7.map(function (w) {
        var d = new Date(w.date + "T12:00:00");
        var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return { day: days[d.getDay()], weight: w.weight };
      });
    } else {
      // Show placeholder message
      data = [
        { day: "Mon", weight: profile.weight },
        { day: "Tue", weight: profile.weight },
      ];
    }

    var weeklyChange = data[data.length - 1].weight - data[0].weight;
    var avgWeight = (data.reduce(function (s, d) { return s + d.weight; }, 0) / data.length).toFixed(1);

    document.getElementById("weekly-avg").textContent = avgWeight;

    var badge = document.getElementById("weekly-trend-badge");
    var trendIcon = document.getElementById("trend-icon");
    var trendLabel = document.getElementById("trend-label");

    if (weightLogs.length < 2) {
      badge.className = "trend-badge muted";
      trendIcon.innerHTML = '<path d="M5 12h14"/>';
      trendLabel.textContent = "Log weight";
    } else if (weeklyChange < -0.3) {
      badge.className = "trend-badge success";
      trendIcon.innerHTML = '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>';
      trendLabel.textContent = "On track";
    } else if (weeklyChange > 0.3) {
      badge.className = "trend-badge destructive";
      trendIcon.innerHTML = '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>';
      trendLabel.textContent = "Trending up";
    } else {
      badge.className = "trend-badge muted";
      trendIcon.innerHTML = '<path d="M5 12h14"/>';
      trendLabel.textContent = "Maintaining";
    }

    if (weightLogs.length >= 2) {
      drawLineChart(container, data, "day", "weight", " lbs");
    } else {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:hsl(var(--muted-foreground));font-size:0.875rem">Log your weight on the Progress page to see trends</div>';
    }
  }

  // ── Today Log ────────────────────────────────────────────

  function renderTodayLog() {
    var el = document.getElementById("today-log");

    if (foodEntries.length === 0) {
      el.innerHTML =
        '<div class="empty-log">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        '<p>No meals logged yet today</p>' +
        '<p class="sub">Tap + to log your first meal</p>' +
        "</div>";
      return;
    }

    var grouped = {};
    foodEntries.forEach(function (e) {
      if (!grouped[e.meal]) grouped[e.meal] = [];
      grouped[e.meal].push(e);
    });

    var html = "";
    for (var meal in grouped) {
      if (!grouped.hasOwnProperty(meal)) continue;
      var items = grouped[meal];
      var pTotal = items.reduce(function (s, e) { return s + e.protein; }, 0);
      var cTotal = items.reduce(function (s, e) { return s + e.carbs; }, 0);
      var fTotal = items.reduce(function (s, e) { return s + e.fats; }, 0);
      html += '<div class="meal-group">';
      html += '<p class="meal-group-label">' + (MEAL_LABELS[meal] || meal) + "</p>";
      items.forEach(function (entry) {
        html +=
          '<div class="meal-entry">' +
          '<span class="food-name">' + esc(entry.name) + "</span>" +
          '<button class="btn-link" data-delete-food="' + entry.id + '" style="font-size:0.75rem;color:hsl(var(--destructive))">remove</button>' +
          '<span class="food-cal font-display">' + entry.calories + " cal</span>" +
          "</div>";
      });
      html +=
        '<div class="meal-macros-summary">' +
        '<span class="protein">P: ' + Math.round(pTotal) + "g</span>" +
        '<span class="carbs">C: ' + Math.round(cTotal) + "g</span>" +
        '<span class="fats">F: ' + Math.round(fTotal) + "g</span>" +
        "</div></div>";
    }
    el.innerHTML = html;

    // Bind delete buttons
    el.querySelectorAll("[data-delete-food]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteFoodEntry(btn.getAttribute("data-delete-food"));
        updateCalorieRing();
        renderTodayLog();
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  // QUICK LOG
  // ══════════════════════════════════════════════════════════

  function openQuickLog() {
    quickLogOpen = true;
    document.getElementById("quicklog-overlay").classList.add("open");
    document.getElementById("quicklog-sheet").classList.add("open");
    renderFoodList();
    renderMealChips();
  }

  function closeQuickLog() {
    quickLogOpen = false;
    document.getElementById("quicklog-overlay").classList.remove("open");
    document.getElementById("quicklog-sheet").classList.remove("open");
    document.getElementById("food-search").value = "";
    hideServingPanel();
  }

  function renderMealChips() {
    var el = document.getElementById("meal-chips");
    el.innerHTML = MEALS.map(function (m) {
      return '<button class="chip' + (selectedMeal === m.id ? " active" : "") + '" data-meal="' + m.id + '">' + m.label + "</button>";
    }).join("");
    el.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedMeal = btn.dataset.meal;
        renderMealChips();
      });
    });
  }

  var selectedFood = null;

  function renderFoodList(filter) {
    var el = document.getElementById("food-list");
    var query = (filter || "").toLowerCase();
    var filtered = QUICK_FOODS.filter(function (f) { return f.name.toLowerCase().includes(query); });

    el.innerHTML = filtered
      .map(function (f) {
        var macros = calcFoodMacros(f, f.serving);
        return '<button class="quick-food-item" data-food="' + esc(f.name) + '">' +
          '<span class="food-emoji">' + f.emoji + "</span>" +
          '<div class="food-info">' +
          '<p class="name">' + esc(f.name) + "</p>" +
          '<p class="macros">' + f.serving + f.unit + ' · P: ' + macros.protein + "g · C: " + macros.carbs + "g · F: " + macros.fats + "g</p>" +
          "</div>" +
          '<div class="food-cal-info">' +
          '<p class="cal-num font-display">' + macros.calories + "</p>" +
          '<p class="cal-label">cal</p>' +
          "</div></button>";
      })
      .join("");

    el.querySelectorAll(".quick-food-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var food = QUICK_FOODS.find(function (f) { return f.name === btn.dataset.food; });
        if (!food) return;
        showServingPanel(food);
      });
    });
  }

  function showServingPanel(food) {
    selectedFood = food;
    document.getElementById("serving-panel").style.display = "block";
    document.getElementById("food-list-section").style.display = "none";
    document.querySelector(".search-wrap").style.display = "none";
    document.getElementById("serving-emoji").textContent = food.emoji;
    document.getElementById("serving-food-name").textContent = food.name;
    var amountInput = document.getElementById("serving-amount");
    amountInput.value = food.serving;
    document.getElementById("serving-unit").value = food.unit || "g";
    updateServingMacros();
    amountInput.focus();
  }

  function hideServingPanel() {
    selectedFood = null;
    document.getElementById("serving-panel").style.display = "none";
    document.getElementById("food-list-section").style.display = "";
    document.querySelector(".search-wrap").style.display = "";
  }

  function getServingGrams() {
    var amount = parseFloat(document.getElementById("serving-amount").value) || 0;
    var unit = document.getElementById("serving-unit").value;
    return unit === "oz" ? amount * 28.3495 : amount;
  }

  function updateServingMacros() {
    if (!selectedFood) return;
    var grams = getServingGrams();
    var macros = calcFoodMacros(selectedFood, grams);
    document.getElementById("serving-macros").innerHTML =
      '<span>' + macros.calories + ' cal</span>' +
      '<span>P: ' + macros.protein + 'g</span>' +
      '<span>C: ' + macros.carbs + 'g</span>' +
      '<span>F: ' + macros.fats + 'g</span>';
  }

  function confirmServing() {
    if (!selectedFood) return;
    var grams = getServingGrams();
    if (grams <= 0) return;
    var macros = calcFoodMacros(selectedFood, grams);
    var amount = parseFloat(document.getElementById("serving-amount").value) || 0;
    var unit = document.getElementById("serving-unit").value;
    var food = {
      name: selectedFood.name + " (" + amount + unit + ")",
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fats: macros.fats,
    };
    addFoodEntry(food, selectedMeal);
    updateCalorieRing();
    renderTodayLog();
    hideServingPanel();
    closeQuickLog();
  }

  function addCustomFood() {
    var name = document.getElementById("custom-food-name").value.trim();
    var cal = parseFloat(document.getElementById("custom-food-cal").value) || 0;
    var protein = parseFloat(document.getElementById("custom-food-protein").value) || 0;
    var carbs = parseFloat(document.getElementById("custom-food-carbs").value) || 0;
    var fats = parseFloat(document.getElementById("custom-food-fats").value) || 0;
    if (!name || cal <= 0) return;
    var food = { name: name, calories: Math.round(cal), protein: protein, carbs: carbs, fats: fats };
    addFoodEntry(food, selectedMeal);
    updateCalorieRing();
    renderTodayLog();
    // Clear inputs
    document.getElementById("custom-food-name").value = "";
    document.getElementById("custom-food-cal").value = "";
    document.getElementById("custom-food-protein").value = "";
    document.getElementById("custom-food-carbs").value = "";
    document.getElementById("custom-food-fats").value = "";
    closeQuickLog();
  }

  // ══════════════════════════════════════════════════════════
  // MEAL PLAN PAGE
  // ══════════════════════════════════════════════════════════

  function renderMeals() {
    document.getElementById("meals-macro-summary").textContent =
      profile.calories + " cal · " + profile.protein + "g P · " + profile.carbs + "g C · " + profile.fats + "g F";
    renderExclusionTags();
    renderMealPlanOutput();
  }

  function renderExclusionTags() {
    var el = document.getElementById("exclusion-tags");
    if (!el) return;
    var exclusions = profile.exclusions || [];
    el.innerHTML = exclusions.map(function (item) {
      return '<span class="exclusion-tag">' + esc(item) +
        '<button data-remove-exclusion="' + esc(item) + '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
        '</button></span>';
    }).join("");

    el.querySelectorAll("[data-remove-exclusion]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var toRemove = btn.getAttribute("data-remove-exclusion");
        var updated = (profile.exclusions || []).filter(function (e) { return e !== toRemove; });
        updateProfile({ exclusions: updated });
        renderExclusionTags();
      });
    });
  }

  function addExclusion() {
    var input = document.getElementById("exclusion-input");
    var val = input.value.trim();
    if (!val) return;
    var exclusions = profile.exclusions || [];
    // Avoid duplicates (case-insensitive)
    var lower = val.toLowerCase();
    if (exclusions.some(function (e) { return e.toLowerCase() === lower; })) {
      input.value = "";
      return;
    }
    exclusions.push(val);
    updateProfile({ exclusions: exclusions });
    input.value = "";
    renderExclusionTags();
  }

  function renderMealPlanOutput() {
    var el = document.getElementById("meal-plan-output");

    if (mealPlanLoading) {
      el.innerHTML =
        '<div class="empty-meals">' +
        '<svg class="spinner" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>' +
        '<p style="margin-top:0.75rem">Generating your meal plan...</p></div>';
      return;
    }

    if (mealPlanMeals.length === 0) {
      el.innerHTML =
        '<div class="empty-meals">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3a4.2 4.2 0 0 0 6 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/></svg>' +
        "<p>Tap generate to create a meal plan that hits your macro targets</p></div>";
      return;
    }

    var totals = mealPlanMeals.reduce(
      function (acc, m) {
        return {
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fats: acc.fats + m.fats,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

    var html =
      '<div class="daily-total-card">' +
      '<span class="dt-label">Daily Total</span>' +
      '<div class="dt-macros">' +
      '<span class="cal" style="font-weight:600">' + Math.round(totals.calories) + " cal</span>" +
      '<span class="p">' + Math.round(totals.protein) + "g P</span>" +
      '<span class="c">' + Math.round(totals.carbs) + "g C</span>" +
      '<span class="f">' + Math.round(totals.fats) + "g F</span>" +
      "</div></div>";

    mealPlanMeals.forEach(function (meal, i) {
      html +=
        '<div class="meal-plan-card" style="animation:fadeInUp 0.3s ease ' + (i * 0.05) + 's both">' +
        '<button class="meal-plan-header" data-meal-idx="' + i + '">' +
        '<div class="meal-info">' +
        '<p class="meal-type">' + (MEAL_PLAN_LABELS[meal.meal_type] || meal.meal_type) + "</p>" +
        '<p class="meal-name">' + esc(meal.name) + "</p>" +
        '<div class="meal-macros">' +
        '<span class="cal">' + meal.calories + " cal</span>" +
        '<span class="p">' + meal.protein + "g P</span>" +
        '<span class="c">' + meal.carbs + "g C</span>" +
        '<span class="f">' + meal.fats + "g F</span>" +
        "</div></div>" +
        '<div class="meal-meta">' +
        '<div class="prep-time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>' +
        meal.prep_time_min + "m</span></div>" +
        '<svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
        "</div></button>" +
        '<div class="meal-plan-body" id="mpb-' + i + '">' +
        '<div class="meal-plan-body-inner">' +
        '<p class="ingredients-label">Ingredients</p>' +
        (meal.ingredients || [])
          .map(function (ing) {
            return '<div class="ingredient-item"><span class="ing-name">' + esc(ing.name) + '</span><span class="ing-amount">' + esc(ing.amount) + "</span></div>";
          })
          .join("") +
        "</div></div></div>";
    });

    el.innerHTML = html;

    el.querySelectorAll(".meal-plan-header").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = btn.dataset.mealIdx;
        var body = document.getElementById("mpb-" + idx);
        var icon = btn.querySelector(".expand-icon");
        body.classList.toggle("open");
        icon.classList.toggle("open");
      });
    });
  }

  async function generateMealPlan() {
    if (mealPlanLoading) return;
    mealPlanLoading = true;
    mealPlanMeals = [];
    savedMealPlanId = null;
    renderMealPlanOutput();

    try {
      var prefs = document.getElementById("meal-preferences").value.trim();
      var exclusions = profile.exclusions || [];
      // Build combined preferences string including exclusions
      var fullPrefs = prefs || "";
      if (exclusions.length > 0) {
        var excludeStr = "MUST NOT include these foods (allergies/dislikes): " + exclusions.join(", ");
        fullPrefs = fullPrefs ? fullPrefs + ". " + excludeStr : excludeStr;
      }
      var { data, error } = await supabase.functions.invoke("generate-meal-plan", {
        body: {
          calories: profile.calories,
          protein: profile.protein,
          carbs: profile.carbs,
          fats: profile.fats,
          preferences: fullPrefs || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      mealPlanMeals = (data.meals || []).sort(function (a, b) {
        return MEAL_PLAN_ORDER.indexOf(a.meal_type) - MEAL_PLAN_ORDER.indexOf(b.meal_type);
      });

      cacheMealPlan();
      saveMealPlanToSupabase(prefs);
    } catch (e) {
      console.error(e);
      var el = document.getElementById("meal-plan-output");
      el.innerHTML =
        '<div class="card" style="text-align:center;padding:2rem">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--destructive))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 0.5rem"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>' +
        '<p style="font-size:0.875rem;color:hsl(var(--foreground));font-weight:500">Failed to generate meal plan</p>' +
        '<p style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin-top:0.25rem">' + esc(e.message || "Please try again") + "</p></div>";
    } finally {
      mealPlanLoading = false;
      if (mealPlanMeals.length > 0) renderMealPlanOutput();
    }
  }

  // ══════════════════════════════════════════════════════════
  // PROGRESS PAGE
  // ══════════════════════════════════════════════════════════

  function renderProgress() {
    // Calculate stats from real data
    var totalLost = 0;
    var streak = 0;
    var durationWeeks = 0;

    if (weightLogs.length >= 2) {
      totalLost = weightLogs[0].weight - weightLogs[weightLogs.length - 1].weight;
      // Calculate duration in weeks
      var firstDate = new Date(weightLogs[0].date);
      var lastDate = new Date(weightLogs[weightLogs.length - 1].date);
      durationWeeks = Math.max(1, Math.round((lastDate - firstDate) / (7 * 24 * 60 * 60 * 1000)));
    }

    // Calculate streak from food entries (count consecutive days with entries going backwards)
    streak = foodEntries.length > 0 ? 1 : 0;
    // Simple: just check if we have today's entries
    var today = todayStr();
    if (foodEntries.length > 0) {
      streak = 1; // At least today
    }

    var statsEl = document.getElementById("progress-stats");
    statsEl.innerHTML = [
      {
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--success))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
        value: totalLost > 0 ? totalLost.toFixed(1) + " lbs" : "--",
        label: "Lost",
      },
      {
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
        value: streak > 0 ? streak + " day" + (streak > 1 ? "s" : "") : "--",
        label: "Streak",
      },
      {
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
        value: durationWeeks > 0 ? durationWeeks + " week" + (durationWeeks > 1 ? "s" : "") : "--",
        label: "Duration",
      },
    ]
      .map(function (s) {
        return '<div class="stat-card animate-in animate-delay-1">' + s.icon + '<p class="stat-value font-display">' + s.value + "</p>" + '<p class="stat-label">' + s.label + "</p></div>";
      })
      .join("");

    // Weight trend chart
    if (weightLogs.length >= 2) {
      // Group by week for the trend chart
      var weeklyData = getWeeklyAverages();
      drawLineChart(document.getElementById("weight-trend-chart"), weeklyData, "week", "avg", " lbs");
    } else {
      document.getElementById("weight-trend-chart").innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:hsl(var(--muted-foreground));font-size:0.875rem">Log at least 2 weights to see trends</div>';
    }

    // Adherence chart — compute from food entries (last 7 days)
    var adherenceData = computeAdherence();
    if (adherenceData.length > 0) {
      drawBarChart(document.getElementById("adherence-chart"), adherenceData, "day", "pct", "%");
    } else {
      document.getElementById("adherence-chart").innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:hsl(var(--muted-foreground));font-size:0.875rem">Log food to see adherence data</div>';
    }

    // Set today's weight in the log input if already logged
    var todayLog = weightLogs.find(function (w) { return w.date === todayStr(); });
    var weightInput = document.getElementById("weight-log-input");
    if (todayLog && weightInput) {
      weightInput.value = todayLog.weight;
      document.getElementById("weight-log-status").textContent = "Updated today at " + todayLog.date;
    }
  }

  function getWeeklyAverages() {
    if (weightLogs.length === 0) return [];
    // Group into weeks
    var weeks = [];
    var sorted = weightLogs.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var weekNum = 1;
    var weekEntries = [];
    var firstDate = new Date(sorted[0].date + "T12:00:00");

    sorted.forEach(function (w) {
      var d = new Date(w.date + "T12:00:00");
      var daysSinceStart = Math.floor((d - firstDate) / (24 * 60 * 60 * 1000));
      var currentWeek = Math.floor(daysSinceStart / 7) + 1;
      if (currentWeek !== weekNum) {
        if (weekEntries.length > 0) {
          var avg = weekEntries.reduce(function (s, e) { return s + e; }, 0) / weekEntries.length;
          weeks.push({ week: "W" + weekNum, avg: parseFloat(avg.toFixed(1)) });
        }
        weekNum = currentWeek;
        weekEntries = [];
      }
      weekEntries.push(w.weight);
    });
    // Push last week
    if (weekEntries.length > 0) {
      var avg = weekEntries.reduce(function (s, e) { return s + e; }, 0) / weekEntries.length;
      weeks.push({ week: "W" + weekNum, avg: parseFloat(avg.toFixed(1)) });
    }
    return weeks;
  }

  function computeAdherence() {
    // For today, compute adherence from foodEntries
    if (foodEntries.length === 0) return [];
    var totals = getTotals();
    var pct = Math.round((totals.calories / profile.calories) * 100);
    return [{ day: "Today", pct: pct }];
  }

  // ══════════════════════════════════════════════════════════
  // GOALS PAGE
  // ══════════════════════════════════════════════════════════

  function renderGoals() {
    document.getElementById("goals-calories").textContent = profile.calories;
    document.getElementById("goals-protein").textContent = profile.protein + "g";
    document.getElementById("goals-carbs").textContent = profile.carbs + "g";
    document.getElementById("goals-fats").textContent = profile.fats + "g";
    renderAdjustmentHistory();
  }

  function renderAdjustmentHistory() {
    var el = document.getElementById("adjustment-history");
    if (!el) return;

    if (adjustments.length === 0) {
      el.innerHTML = '<p style="font-size:0.875rem;color:hsl(var(--muted-foreground))">No adjustments yet. Your targets will be recorded when you recalculate.</p>';
      return;
    }

    var html = "";
    var reversed = adjustments.slice().reverse();
    reversed.forEach(function (adj, i) {
      var date = new Date(adj.created_at);
      var label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      var calDiff = adj.new_calories - adj.prev_calories;
      var changeText;
      if (calDiff === 0) {
        changeText = "No calorie change";
      } else if (calDiff > 0) {
        changeText = "Calories increased by " + calDiff;
      } else {
        changeText = "Calories reduced by " + Math.abs(calDiff);
      }

      html +=
        '<div class="adjustment-item">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>' +
        '<div class="adjustment-info">' +
        '<div class="adj-header">' +
        '<span class="adj-week">' + esc(label) + "</span>" +
        '<svg class="adj-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>' +
        '<span class="adj-change">' + esc(changeText) + "</span>" +
        "</div>" +
        '<p class="adj-reason">' + esc(adj.reason) + "</p>" +
        "</div></div>";
    });
    el.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════
  // SETTINGS PAGE
  // ══════════════════════════════════════════════════════════

  function renderSettings() {
    var items = [
      {
        id: "profile",
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        label: "Profile",
        desc: (profile.name || "Not set") + ", " + profile.age + "y, " + profile.sex,
      },
      {
        id: "units",
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 15-3.086-6.172A2 2 0 0 0 16.12 8H7.88a2 2 0 0 0-1.794 1.106L3 15"/><path d="M3.5 13.5h17"/><path d="m21 15-1 6H4l-1-6"/></svg>',
        label: "Units",
        desc: profile.units === "imperial" ? "Imperial (lbs, ft)" : "Metric (kg, cm)",
      },
      {
        id: "goal",
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        label: "Goal",
        desc: (profile.goal === "lose" ? "Lose weight" : profile.goal === "gain" ? "Build muscle" : "Maintain") + " · " + profile.rate + " lb/week",
      },
      {
        id: "reminders",
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
        label: "Reminders",
        desc: (profile.reminderEnabled || profile.weighInReminderEnabled) ? "On" : "Off",
      },
      {
        id: "appearance",
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
        label: "Appearance",
        desc: "Theme",
      },
      {
        id: "about",
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
        label: "About MacroCore",
        desc: "Version 1.0.0",
      },
    ];

    var el = document.getElementById("settings-list");
    el.innerHTML =
      items
        .map(function (item) {
          return '<button class="settings-item" data-panel="' + item.id + '">' +
            '<div class="settings-icon">' + item.icon + "</div>" +
            '<div class="settings-info">' +
            '<p class="title">' + item.label + "</p>" +
            '<p class="desc">' + esc(item.desc) + "</p></div>" +
            '<svg class="settings-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
            "</button>";
        })
        .join("") +
      '<div style="margin-top:1.5rem;display:flex;flex-direction:column;gap:0.5rem">' +
      '<button class="btn btn-ghost" id="btn-reset-onboarding" style="width:100%">Reset Onboarding</button>' +
      '<button class="btn btn-ghost" id="btn-sign-out" style="width:100%">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg> Sign Out</button>' +
      '<button class="btn-destructive" id="btn-delete-account" style="width:100%">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg> Delete Account</button>' +
      '</div>';

    el.querySelectorAll(".settings-item").forEach(function (btn) {
      btn.addEventListener("click", function () { openSettingsPanel(btn.dataset.panel); });
    });

    document.getElementById("btn-reset-onboarding").addEventListener("click", function () {
      updateProfile({ onboarded: false });
      showOnboarding();
    });

    document.getElementById("btn-sign-out").addEventListener("click", handleSignOut);
    document.getElementById("btn-delete-account").addEventListener("click", handleDeleteAccount);
  }

  function openSettingsPanel(panelId) {
    var content = document.getElementById("settings-panel-content");
    var html =
      '<button class="back-btn" id="sp-back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg> Back</button>';

    if (panelId === "profile") html += buildProfilePanel();
    else if (panelId === "units") html += buildUnitsPanel();
    else if (panelId === "goal") html += buildGoalPanel();
    else if (panelId === "reminders") html += buildRemindersPanel();
    else if (panelId === "appearance") html += buildAppearancePanel();
    else if (panelId === "about") html += buildAboutPanel();

    content.innerHTML = html;

    document.getElementById("settings-overlay").classList.add("open");
    document.getElementById("settings-panel").classList.add("open");
    document.getElementById("sp-back").addEventListener("click", closeSettingsPanel);

    if (panelId === "profile") bindProfilePanel();
    if (panelId === "units") bindUnitsPanel();
    if (panelId === "goal") bindGoalPanel();
    if (panelId === "reminders") bindRemindersPanel();
    if (panelId === "appearance") bindAppearancePanel();
  }

  function closeSettingsPanel() {
    document.getElementById("settings-overlay").classList.remove("open");
    document.getElementById("settings-panel").classList.remove("open");
    renderSettings();
  }

  // ── Profile Panel ──
  function buildProfilePanel() {
    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">Profile</h2>' +
      '<div><label class="label">Name</label><input type="text" class="input" id="sp-name" value="' + esc(profile.name) + '"></div>' +
      '<div class="grid-2">' +
      '<div><label class="label">Age</label><input type="number" class="input" id="sp-age" value="' + profile.age + '"></div>' +
      '<div><label class="label">Sex</label><div class="sex-selector">' +
      '<button class="sex-btn' + (profile.sex === "male" ? " selected" : "") + '" data-sex="male">Male</button>' +
      '<button class="sex-btn' + (profile.sex === "female" ? " selected" : "") + '" data-sex="female">Female</button>' +
      "</div></div></div>" +
      '<div><label class="label">Height</label><div class="grid-2">' +
      '<div class="input-with-suffix"><input type="number" class="input" id="sp-hft" value="' + profile.heightFt + '"><span class="input-suffix">ft</span></div>' +
      '<div class="input-with-suffix"><input type="number" class="input" id="sp-hin" value="' + profile.heightIn + '"><span class="input-suffix">in</span></div>' +
      "</div></div>" +
      '<div><label class="label">Weight (lbs)</label><input type="number" class="input" id="sp-weight" value="' + profile.weight + '"></div>' +
      '<button class="btn btn-primary" id="sp-recalc" style="margin-top:1rem"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Recalculate Targets</button>'
    );
  }

  function bindProfilePanel() {
    document.getElementById("sp-name").addEventListener("input", function (e) { updateProfile({ name: e.target.value }); });
    document.getElementById("sp-age").addEventListener("input", function (e) { updateProfile({ age: parseInt(e.target.value) || 0 }); });
    document.querySelectorAll("#settings-panel-content .sex-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateProfile({ sex: btn.dataset.sex });
        document.querySelectorAll("#settings-panel-content .sex-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.sex === profile.sex); });
      });
    });
    document.getElementById("sp-hft").addEventListener("input", function (e) { updateProfile({ heightFt: parseInt(e.target.value) || 0 }); });
    document.getElementById("sp-hin").addEventListener("input", function (e) { updateProfile({ heightIn: parseInt(e.target.value) || 0 }); });
    document.getElementById("sp-weight").addEventListener("input", function (e) { updateProfile({ weight: parseInt(e.target.value) || 0 }); });
    document.getElementById("sp-recalc").addEventListener("click", function () {
      recalculate();
      closeSettingsPanel();
    });
  }

  // ── Units Panel ──
  function buildUnitsPanel() {
    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">Units</h2>' +
      '<button class="selection-btn' + (profile.units === "imperial" ? " selected" : "") + '" data-units="imperial">' +
      '<p class="label-text">Imperial</p><p class="desc-text">Pounds, feet, inches</p></button>' +
      '<button class="selection-btn' + (profile.units === "metric" ? " selected" : "") + '" data-units="metric">' +
      '<p class="label-text">Metric</p><p class="desc-text">Kilograms, centimeters</p></button>'
    );
  }

  function bindUnitsPanel() {
    document.querySelectorAll("#settings-panel-content .selection-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateProfile({ units: btn.dataset.units });
        document.querySelectorAll("#settings-panel-content .selection-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.units === profile.units); });
      });
    });
  }

  // ── Goal Panel ──
  function buildGoalPanel() {
    var goals = [
      { value: "lose", label: "Lose Weight", emoji: "📉" },
      { value: "maintain", label: "Maintain Weight", emoji: "⚖️" },
      { value: "gain", label: "Build Muscle", emoji: "💪" },
    ];
    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">Goal</h2>' +
      goals
        .map(function (g) {
          return '<button class="selection-btn' + (profile.goal === g.value ? " selected" : "") + '" data-goal="' + g.value + '">' +
            '<div class="goal-option"><span class="emoji">' + g.emoji + "</span><p class='label-text'>" + g.label + "</p></div></button>";
        })
        .join("") +
      '<div id="sp-rate-section" style="' + (profile.goal === "maintain" ? "display:none" : "") + '">' +
      '<label class="label" style="margin-top:1rem">Rate: <span id="sp-rate-display">' + profile.rate + '</span> lb/week</label>' +
      '<div class="rate-selector">' +
      [0.5, 1, 1.5, 2]
        .map(function (r) { return '<button class="rate-btn' + (profile.rate === r ? " selected" : "") + '" data-rate="' + r + '">' + r + "</button>"; })
        .join("") +
      "</div></div>" +
      '<button class="btn btn-primary" id="sp-update-goal" style="margin-top:1rem"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Update Targets</button>'
    );
  }

  function bindGoalPanel() {
    document.querySelectorAll("#settings-panel-content .selection-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateProfile({ goal: btn.dataset.goal });
        document.querySelectorAll("#settings-panel-content .selection-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.goal === profile.goal); });
        document.getElementById("sp-rate-section").style.display = profile.goal === "maintain" ? "none" : "";
      });
    });
    document.querySelectorAll("#settings-panel-content .rate-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateProfile({ rate: parseFloat(btn.dataset.rate) });
        document.querySelectorAll("#settings-panel-content .rate-btn").forEach(function (b) { b.classList.toggle("selected", parseFloat(b.dataset.rate) === profile.rate); });
        document.getElementById("sp-rate-display").textContent = profile.rate;
      });
    });
    document.getElementById("sp-update-goal").addEventListener("click", function () {
      recalculate();
      closeSettingsPanel();
    });
  }

  // ── Reminders Panel ──
  var DAYS_OF_WEEK = [
    { value: "monday", label: "Monday" },
    { value: "tuesday", label: "Tuesday" },
    { value: "wednesday", label: "Wednesday" },
    { value: "thursday", label: "Thursday" },
    { value: "friday", label: "Friday" },
    { value: "saturday", label: "Saturday" },
    { value: "sunday", label: "Sunday" },
  ];

  function buildRemindersPanel() {
    var dayOptions = DAYS_OF_WEEK.map(function (d) {
      return '<option value="' + d.value + '"' + (profile.weighInDay === d.value ? " selected" : "") + '>' + d.label + '</option>';
    }).join("");

    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">Reminders</h2>' +

      // Meal reminders
      '<div class="card" style="display:flex;align-items:center;justify-content:space-between">' +
      "<div><p style='font-size:0.875rem;font-weight:500;color:hsl(var(--foreground))'>Meal Reminders</p>" +
      "<p style='font-size:0.75rem;color:hsl(var(--muted-foreground))'>Get nudged to log meals</p></div>" +
      '<button class="toggle' + (profile.reminderEnabled ? " on" : "") + '" id="sp-toggle-reminder"><div class="toggle-knob"></div></button>' +
      "</div>" +
      '<div id="sp-reminder-time" style="' + (profile.reminderEnabled ? "" : "display:none") + '">' +
      '<label class="label">Reminder Time</label>' +
      '<input type="time" class="input" id="sp-rtime" value="' + profile.reminderTime + '">' +
      "</div>" +

      // Weekly weigh-in reminder
      '<div class="card" style="display:flex;align-items:center;justify-content:space-between;margin-top:0.75rem">' +
      "<div><p style='font-size:0.875rem;font-weight:500;color:hsl(var(--foreground))'>Weekly Weigh-In</p>" +
      "<p style='font-size:0.75rem;color:hsl(var(--muted-foreground))'>Remind you to log your weight</p></div>" +
      '<button class="toggle' + (profile.weighInReminderEnabled ? " on" : "") + '" id="sp-toggle-weighin"><div class="toggle-knob"></div></button>' +
      "</div>" +
      '<div id="sp-weighin-day" style="' + (profile.weighInReminderEnabled ? "" : "display:none") + '">' +
      '<label class="label">Weigh-In Day</label>' +
      '<select class="input" id="sp-weighin-select">' + dayOptions + '</select>' +
      "</div>"
    );
  }

  function bindRemindersPanel() {
    document.getElementById("sp-toggle-reminder").addEventListener("click", function () {
      updateProfile({ reminderEnabled: !profile.reminderEnabled });
      document.getElementById("sp-toggle-reminder").classList.toggle("on", profile.reminderEnabled);
      document.getElementById("sp-reminder-time").style.display = profile.reminderEnabled ? "" : "none";
    });
    document.getElementById("sp-rtime").addEventListener("input", function (e) {
      updateProfile({ reminderTime: e.target.value });
    });
    document.getElementById("sp-toggle-weighin").addEventListener("click", function () {
      updateProfile({ weighInReminderEnabled: !profile.weighInReminderEnabled });
      document.getElementById("sp-toggle-weighin").classList.toggle("on", profile.weighInReminderEnabled);
      document.getElementById("sp-weighin-day").style.display = profile.weighInReminderEnabled ? "" : "none";
    });
    document.getElementById("sp-weighin-select").addEventListener("change", function (e) {
      updateProfile({ weighInDay: e.target.value });
    });
  }

  // ── Appearance Panel ──
  function buildAppearancePanel() {
    var theme = getTheme();
    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">Appearance</h2>' +
      '<button class="selection-btn' + (theme === "light" ? " selected" : "") + '" data-theme="light">' +
      '<div style="display:flex;align-items:center;gap:0.75rem">' +
      '<div class="settings-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg></div>' +
      '<div><p class="label-text">Light</p><p class="desc-text">Clean and bright</p></div></div></button>' +
      '<button class="selection-btn' + (theme === "dark" ? " selected" : "") + '" data-theme="dark">' +
      '<div style="display:flex;align-items:center;gap:0.75rem">' +
      '<div class="settings-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg></div>' +
      '<div><p class="label-text">Dark</p><p class="desc-text">Easy on the eyes</p></div></div></button>'
    );
  }

  function bindAppearancePanel() {
    document.querySelectorAll("#settings-panel-content .selection-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTheme(btn.dataset.theme);
        document.querySelectorAll("#settings-panel-content .selection-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.theme === getTheme()); });
      });
    });
  }

  // ── About Panel ──
  function buildAboutPanel() {
    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">About MacroCore</h2>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:0.75rem">' +
      '<div class="about-row"><span class="about-label">Version</span><span class="about-value">1.0.0</span></div>' +
      '<div class="about-row"><span class="about-label">Algorithm</span><span class="about-value">Mifflin-St Jeor</span></div>' +
      '<div class="about-row"><span class="about-label">Adjustment Cycle</span><span class="about-value">Weekly</span></div>' +
      "</div>" +
      '<div class="card">' +
      '<p style="font-size:0.875rem;font-weight:500;color:hsl(var(--foreground));margin-bottom:0.5rem">How It Works</p>' +
      '<p style="font-size:0.75rem;color:hsl(var(--muted-foreground));line-height:1.6">' +
      "MacroCore uses the Mifflin-St Jeor equation to calculate your basal metabolic rate, then applies an activity multiplier and goal adjustment. Each week, your targets are recalculated based on your 7-day average weight and adherence patterns." +
      "</p></div>"
    );
  }

  // ══════════════════════════════════════════════════════════
  // SVG CHARTS
  // ══════════════════════════════════════════════════════════

  function drawLineChart(container, data, labelKey, valueKey, valueSuffix) {
    if (!container) return;
    var W = container.clientWidth || 300;
    var H = container.clientHeight || 144;
    var pad = { top: 10, right: 15, bottom: 25, left: 15 };
    var innerW = W - pad.left - pad.right;
    var innerH = H - pad.top - pad.bottom;

    var values = data.map(function (d) { return d[valueKey]; });
    var min = Math.min.apply(null, values) - 1;
    var max = Math.max.apply(null, values) + 1;
    var range = max - min || 1;

    var points = data.map(function (d, i) {
      return {
        x: pad.left + (i / (data.length - 1 || 1)) * innerW,
        y: pad.top + (1 - (d[valueKey] - min) / range) * innerH,
        label: d[labelKey],
        value: d[valueKey],
      };
    });

    var pathD = points.map(function (p, i) { return (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");

    var svg =
      '<svg class="chart-svg" viewBox="0 0 ' + W + " " + H + '">' +
      '<path class="chart-line" d="' + pathD + '"/>';

    points.forEach(function (p, i) {
      svg += '<circle class="chart-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" data-idx="' + i + '"/>';
    });

    data.forEach(function (d, i) {
      var x = pad.left + (i / (data.length - 1 || 1)) * innerW;
      svg += '<text class="chart-label" x="' + x.toFixed(1) + '" y="' + (H - 4) + '">' + d[labelKey] + "</text>";
    });

    svg += "</svg>";
    svg += '<div class="chart-tooltip" id="tt-' + container.id + '"><p class="tooltip-label"></p><p class="tooltip-value"></p></div>';

    container.innerHTML = svg;

    var tooltip = container.querySelector(".chart-tooltip");
    container.querySelectorAll(".chart-dot").forEach(function (dot) {
      dot.addEventListener("mouseenter", function () {
        var idx = parseInt(dot.dataset.idx);
        var p = points[idx];
        tooltip.querySelector(".tooltip-label").textContent = p.label;
        tooltip.querySelector(".tooltip-value").textContent = p.value + (valueSuffix || "");
        tooltip.style.left = Math.min(p.x - 30, W - 80) + "px";
        tooltip.style.top = p.y - 45 + "px";
        tooltip.classList.add("visible");
      });
      dot.addEventListener("mouseleave", function () {
        tooltip.classList.remove("visible");
      });
    });
  }

  function drawBarChart(container, data, labelKey, valueKey, valueSuffix) {
    if (!container) return;
    var W = container.clientWidth || 300;
    var H = container.clientHeight || 144;
    var pad = { top: 10, right: 10, bottom: 25, left: 10 };
    var innerW = W - pad.left - pad.right;
    var innerH = H - pad.top - pad.bottom;

    var maxVal = 120;
    var barW = (innerW / data.length) * 0.6;
    var gap = (innerW / data.length) * 0.4;

    var svg = '<svg class="chart-svg" viewBox="0 0 ' + W + " " + H + '">';

    data.forEach(function (d, i) {
      var x = pad.left + (i / data.length) * innerW + gap / 2;
      var barH = (d[valueKey] / maxVal) * innerH;
      var y = pad.top + innerH - barH;
      svg +=
        '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" rx="4" data-idx="' + i + '"/>';
      svg +=
        '<text class="chart-label" x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 4) + '">' + d[labelKey] + "</text>";
    });

    svg += "</svg>";
    svg += '<div class="chart-tooltip" id="tt-' + container.id + '"><p class="tooltip-label"></p><p class="tooltip-value"></p></div>';

    container.innerHTML = svg;

    var tooltip = container.querySelector(".chart-tooltip");
    container.querySelectorAll(".chart-bar").forEach(function (bar) {
      bar.addEventListener("mouseenter", function () {
        var idx = parseInt(bar.dataset.idx);
        var d = data[idx];
        tooltip.querySelector(".tooltip-label").textContent = d[labelKey];
        tooltip.querySelector(".tooltip-value").textContent = d[valueKey] + (valueSuffix || "");
        var x = parseFloat(bar.getAttribute("x"));
        var y = parseFloat(bar.getAttribute("y"));
        tooltip.style.left = Math.min(x - 20, W - 80) + "px";
        tooltip.style.top = y - 45 + "px";
        tooltip.classList.add("visible");
      });
      bar.addEventListener("mouseleave", function () {
        tooltip.classList.remove("visible");
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════════

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ══════════════════════════════════════════════════════════
  // DATA LOADING (called after auth)
  // ══════════════════════════════════════════════════════════

  async function loadAllData() {
    // 1. Load from cache first (instant)
    profile = loadProfileFromCache();
    loadFoodEntriesFromCache();
    loadWeightLogsFromCache();
    loadMealPlanFromCache();
    loadAdjustmentsFromCache();

    // 2. Sync from Supabase in background (updates cache)
    try {
      await Promise.all([
        loadProfileFromSupabase(),
        loadFoodEntriesFromSupabase(),
        loadWeightLogsFromSupabase(),
        loadMealPlanFromSupabase(),
        loadAdjustmentsFromSupabase(),
      ]);
    } catch (err) {
      console.error("Supabase sync error:", err);
    }
  }

  async function startApp() {
    hideAuth();

    try {
      await loadAllData();
    } catch (err) {
      console.error("loadAllData error (using cached data):", err);
    }

    if (profile.onboarded) {
      document.getElementById("onboarding").style.display = "none";
      document.getElementById("bottom-nav").style.display = "";
      handleRoute();
    } else {
      showOnboarding();
    }
  }

  // ══════════════════════════════════════════════════════════
  // EVENT BINDINGS
  // ══════════════════════════════════════════════════════════

  function init() {
    // Theme
    setTheme(getTheme());

    // Auth events
    document.getElementById("auth-form").addEventListener("submit", handleAuthSubmit);
    document.getElementById("auth-toggle-btn").addEventListener("click", toggleAuthMode);

    // Auth state listener
    var appStarted = false;
    supabase.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) {
        currentUser = session.user;
        if (!appStarted) {
          appStarted = true;
          startApp();
        }
      } else if (event === "SIGNED_OUT") {
        currentUser = null;
        appStarted = false;
        showAuth();
      }
    });

    // Check for existing session (fallback if onAuthStateChange doesn't fire)
    supabase.auth.getSession().then(function (result) {
      var session = result.data.session;
      if (session && session.user) {
        currentUser = session.user;
        if (!appStarted) {
          appStarted = true;
          startApp();
        }
      } else if (!appStarted) {
        showAuth();
      }
    });

    // Router
    window.addEventListener("hashchange", handleRoute);
    document.querySelectorAll(".nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () { navigate(btn.dataset.page); });
    });

    // Onboarding events
    document.getElementById("btn-get-started").addEventListener("click", obNext);
    document.getElementById("onboarding-back").addEventListener("click", obBack);

    // Basics step
    document.getElementById("ob-name").addEventListener("input", function (e) {
      updateProfile({ name: e.target.value });
      updateBasicsBtn();
    });
    document.getElementById("ob-age").addEventListener("input", function (e) { updateProfile({ age: parseInt(e.target.value) || 0 }); });
    document.querySelectorAll("#step-basics .sex-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateProfile({ sex: btn.dataset.sex });
        document.querySelectorAll("#step-basics .sex-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.sex === profile.sex); });
      });
    });
    document.getElementById("btn-basics-next").addEventListener("click", obNext);

    // Body step
    document.getElementById("ob-height-ft").addEventListener("input", function (e) { updateProfile({ heightFt: parseInt(e.target.value) || 0 }); });
    document.getElementById("ob-height-in").addEventListener("input", function (e) { updateProfile({ heightIn: parseInt(e.target.value) || 0 }); });
    document.getElementById("ob-weight").addEventListener("input", function (e) { updateProfile({ weight: parseInt(e.target.value) || 0 }); });
    document.getElementById("btn-body-next").addEventListener("click", obNext);

    // Activity step
    document.querySelectorAll("#activity-options .selection-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateProfile({ activityLevel: btn.dataset.activity });
        document.querySelectorAll("#activity-options .selection-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.activity === profile.activityLevel); });
      });
    });
    document.getElementById("btn-activity-next").addEventListener("click", obNext);

    // Goal step
    document.querySelectorAll("#goal-options .selection-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateProfile({ goal: btn.dataset.goal });
        document.querySelectorAll("#goal-options .selection-btn").forEach(function (b) { b.classList.toggle("selected", b.dataset.goal === profile.goal); });
        document.getElementById("rate-section").style.display = profile.goal === "maintain" ? "none" : "";
      });
    });
    document.querySelectorAll("#step-goal .rate-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateProfile({ rate: parseFloat(btn.dataset.rate) });
        document.querySelectorAll("#step-goal .rate-btn").forEach(function (b) { b.classList.toggle("selected", parseFloat(b.dataset.rate) === profile.rate); });
        document.getElementById("rate-display").textContent = profile.rate;
      });
    });
    document.getElementById("btn-goal-next").addEventListener("click", obNext);

    // Results / finish
    document.getElementById("btn-start-tracking").addEventListener("click", function () {
      var macros = calculateMacros(profile);
      updateProfile({ ...macros, onboarded: true, startedAt: profile.startedAt || new Date().toISOString() });
      // Record initial adjustment
      addAdjustment({ calories: 0, protein: 0, carbs: 0, fats: 0 }, macros, "Initial targets set from onboarding");
      hideOnboarding();
    });

    // Calorie ring expand
    document.getElementById("calorie-ring-btn").addEventListener("click", toggleMacroBreakdown);

    // Quick log
    document.getElementById("fab-log").addEventListener("click", openQuickLog);
    document.getElementById("quicklog-overlay").addEventListener("click", closeQuickLog);
    document.getElementById("quicklog-close").addEventListener("click", closeQuickLog);
    document.getElementById("food-search").addEventListener("input", function (e) { renderFoodList(e.target.value); });

    // Serving size panel
    document.getElementById("serving-cancel").addEventListener("click", hideServingPanel);
    document.getElementById("serving-confirm").addEventListener("click", confirmServing);
    document.getElementById("serving-amount").addEventListener("input", updateServingMacros);
    document.getElementById("serving-unit").addEventListener("change", updateServingMacros);

    // Custom food entry
    document.getElementById("btn-custom-food").addEventListener("click", addCustomFood);

    // Settings panel overlay close
    document.getElementById("settings-overlay").addEventListener("click", closeSettingsPanel);

    // Meal plan generate
    document.getElementById("btn-generate-meal").addEventListener("click", generateMealPlan);

    // Exclusion tags
    document.getElementById("btn-add-exclusion").addEventListener("click", addExclusion);
    document.getElementById("exclusion-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        addExclusion();
      }
    });

    // Weight logging
    function handleWeightLog() {
      var input = document.getElementById("weight-log-input");
      var val = parseFloat(input.value);
      var statusEl = document.getElementById("weight-log-status");
      if (!val || val <= 0 || val > 1500) {
        statusEl.textContent = "Please enter a valid weight";
        statusEl.style.color = "hsl(var(--destructive))";
        return;
      }
      logWeight(val);
      statusEl.textContent = "Weight logged for today!";
      statusEl.style.color = "hsl(var(--success))";
      try { renderProgress(); } catch(err) { console.error("renderProgress error after log:", err); }
      try { renderWeeklyChart(); } catch(err) { console.error("renderWeeklyChart error after log:", err); }
    }
    document.getElementById("btn-log-weight").addEventListener("click", handleWeightLog);
    document.getElementById("weight-log-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); handleWeightLog(); }
    });
  }

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
