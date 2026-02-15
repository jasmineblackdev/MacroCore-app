// ============================================================
// MacroCore — Vanilla JS Application
// ============================================================

(function () {
  "use strict";

  // ── Supabase config ──────────────────────────────────────
  const SUPABASE_URL = "https://xftrbpjruitppdcdqzep.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmdHJicGpydWl0cHBkY2RxemVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4Mzg5NzgsImV4cCI6MjA4NjQxNDk3OH0.e1Q4qbgUGRPi8VJsol1HdXKv5rUAH3F6V3i6EVDVsC8";

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
    onboarded: false,
    calories: 2200,
    protein: 165,
    carbs: 220,
    fats: 73,
  };

  // ── State ────────────────────────────────────────────────
  // Reset if coming from React version (different runtime marker)
  if (!localStorage.getItem("macrocore_vanilla")) {
    localStorage.removeItem("macrocore_profile");
    localStorage.setItem("macrocore_vanilla", "1");
  }
  let profile = loadProfile();
  let foodEntries = [
    { id: "1", name: "Greek Yogurt", calories: 130, protein: 17, carbs: 6, fats: 4, meal: "breakfast" },
    { id: "2", name: "Banana", calories: 105, protein: 1.3, carbs: 27, fats: 0.4, meal: "breakfast" },
    { id: "3", name: "Chicken Breast", calories: 165, protein: 31, carbs: 0, fats: 3.6, meal: "lunch" },
    { id: "4", name: "Brown Rice (1 cup)", calories: 216, protein: 5, carbs: 45, fats: 1.8, meal: "lunch" },
  ];
  let macroExpanded = false;
  let quickLogOpen = false;
  let selectedMeal = "lunch";
  let mealPlanMeals = [];
  let mealPlanLoading = false;

  // ── Quick Foods DB ───────────────────────────────────────
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

  // ── Sample Data ──────────────────────────────────────────
  const WEIGHT_DATA = [
    { day: "Mon", weight: 182.4 },
    { day: "Tue", weight: 183.1 },
    { day: "Wed", weight: 181.8 },
    { day: "Thu", weight: 182.0 },
    { day: "Fri", weight: 181.2 },
    { day: "Sat", weight: 180.8 },
    { day: "Sun", weight: 180.5 },
  ];

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

  const MEAL_PLAN_ORDER = ["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner"];
  const MEAL_PLAN_LABELS = {
    breakfast: "Breakfast",
    morning_snack: "Morning Snack",
    lunch: "Lunch",
    afternoon_snack: "Afternoon Snack",
    dinner: "Dinner",
  };

  // ══════════════════════════════════════════════════════════
  // PROFILE / MACRO CALCULATOR
  // ══════════════════════════════════════════════════════════

  function loadProfile() {
    try {
      const saved = localStorage.getItem("macrocore_profile");
      if (saved) return { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
    } catch (_) { /* ignore */ }
    return { ...DEFAULT_PROFILE };
  }

  function saveProfile() {
    localStorage.setItem("macrocore_profile", JSON.stringify(profile));
  }

  function updateProfile(updates) {
    Object.assign(profile, updates);
    saveProfile();
  }

  function calculateMacros(p) {
    const { age, sex, heightFt, heightIn, weight, activityLevel, goal, rate } = p;
    const heightCm = (heightFt * 12 + heightIn) * 2.54;
    const weightKg = weight * 0.453592;
    let bmr;
    if (sex === "male") {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    } else {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    }
    const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
    let tdee = bmr * multipliers[activityLevel];
    if (goal === "lose") tdee -= rate * 500;
    else if (goal === "gain") tdee += rate * 250;
    const calories = Math.round(Math.max(tdee, 1200));
    const protein = Math.round(Math.max(weightKg * 2.0, 50));
    const fats = Math.round(Math.max((calories * 0.25) / 9, 30));
    const carbs = Math.round(Math.max((calories - protein * 4 - fats * 9) / 4, 50));
    return { calories, protein, carbs, fats };
  }

  function recalculate() {
    const macros = calculateMacros(profile);
    updateProfile(macros);
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

  const PAGES = ["home", "meals", "progress", "goals", "settings"];

  function navigate(page) {
    if (!PAGES.includes(page)) page = "home";
    window.location.hash = page;
  }

  function handleRoute() {
    const hash = window.location.hash.slice(1) || "home";
    const page = PAGES.includes(hash) ? hash : "home";

    PAGES.forEach((p) => {
      const el = document.getElementById("page-" + p);
      if (el) el.classList.toggle("active", p === page);
    });

    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.page === page);
    });

    // Refresh page-specific content
    if (page === "home") renderHome();
    if (page === "meals") renderMeals();
    if (page === "progress") renderProgress();
    if (page === "goals") renderGoals();
    if (page === "settings") renderSettings();
  }

  // ══════════════════════════════════════════════════════════
  // ONBOARDING
  // ══════════════════════════════════════════════════════════

  const OB_STEPS = ["welcome", "basics", "body", "activity", "goal", "results"];
  let obStep = 0;

  function showOnboarding() {
    const el = document.getElementById("onboarding");
    el.style.display = "flex";
    el.classList.remove("hidden");
    document.getElementById("bottom-nav").style.display = "none";
    obStep = 0;
    renderObStep();
  }

  function hideOnboarding() {
    const el = document.getElementById("onboarding");
    el.classList.add("hidden");
    setTimeout(() => { el.style.display = "none"; }, 300);
    document.getElementById("bottom-nav").style.display = "";
    handleRoute();
  }

  function renderObStep() {
    const stepName = OB_STEPS[obStep];
    const progBar = document.getElementById("onboarding-progress");
    progBar.style.display = stepName === "welcome" ? "none" : "flex";

    // Fill progress segments
    for (let i = 1; i <= 5; i++) {
      document.getElementById("prog-" + i).classList.toggle("filled", i <= obStep);
    }

    // Show/hide steps
    OB_STEPS.forEach((s) => {
      const stepEl = document.getElementById("step-" + s);
      if (stepEl) stepEl.classList.toggle("active", s === stepName);
    });

    // Sync form values
    if (stepName === "basics") {
      document.getElementById("ob-name").value = profile.name;
      document.getElementById("ob-age").value = profile.age;
      document.querySelectorAll(".sex-btn").forEach((b) => b.classList.toggle("selected", b.dataset.sex === profile.sex));
      updateBasicsBtn();
    }
    if (stepName === "body") {
      document.getElementById("ob-height-ft").value = profile.heightFt;
      document.getElementById("ob-height-in").value = profile.heightIn;
      document.getElementById("ob-weight").value = profile.weight;
    }
    if (stepName === "activity") {
      document.querySelectorAll("#activity-options .selection-btn").forEach((b) => {
        b.classList.toggle("selected", b.dataset.activity === profile.activityLevel);
      });
    }
    if (stepName === "goal") {
      document.querySelectorAll("#goal-options .selection-btn").forEach((b) => {
        b.classList.toggle("selected", b.dataset.goal === profile.goal);
      });
      document.querySelectorAll(".rate-btn").forEach((b) => {
        b.classList.toggle("selected", parseFloat(b.dataset.rate) === profile.rate);
      });
      document.getElementById("rate-display").textContent = profile.rate;
      const rateSection = document.getElementById("rate-section");
      rateSection.style.display = profile.goal === "maintain" ? "none" : "";
      document.getElementById("rate-hint").textContent =
        profile.goal === "lose"
          ? "0.5-1 lb/week is recommended for sustainable loss"
          : "0.5-1 lb/week is ideal for lean gains";
    }
    if (stepName === "results") {
      const m = calculateMacros(profile);
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
    const name = document.getElementById("ob-name").value.trim();
    document.getElementById("btn-basics-next").disabled = !name;
  }

  // ══════════════════════════════════════════════════════════
  // HOME PAGE
  // ══════════════════════════════════════════════════════════

  function renderHome() {
    updateGreeting();
    updateCalorieRing();
    renderWeeklyChart();
    renderTodayLog();
  }

  function updateGreeting() {
    const h = new Date().getHours();
    let g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    if (profile.name) g += ", " + profile.name;
    document.getElementById("greeting-text").textContent = g;
  }

  function getTotals() {
    return foodEntries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        protein: acc.protein + e.protein,
        carbs: acc.carbs + e.carbs,
        fats: acc.fats + e.fats,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }

  function updateCalorieRing() {
    const totals = getTotals();
    const current = Math.round(totals.calories);
    const target = profile.calories;
    const pct = Math.min((current / target) * 100, 100);
    const circumference = 2 * Math.PI * 45; // ~282.74
    const offset = circumference - (pct / 100) * circumference;

    document.getElementById("calorie-ring-circle").setAttribute("stroke-dashoffset", offset);
    document.getElementById("ring-current").textContent = current.toLocaleString();
    document.getElementById("ring-target").textContent = "of " + target.toLocaleString() + " cal";

    const remaining = target - current;
    document.getElementById("ring-remaining").textContent =
      remaining > 0 ? remaining + " cal remaining" : "Goal reached! 🎉";

    // Macro targets
    document.getElementById("macro-p-tar").textContent = profile.protein;
    document.getElementById("macro-c-tar").textContent = profile.carbs;
    document.getElementById("macro-f-tar").textContent = profile.fats;

    // Macro current
    document.getElementById("macro-p-cur").textContent = Math.round(totals.protein);
    document.getElementById("macro-c-cur").textContent = Math.round(totals.carbs);
    document.getElementById("macro-f-cur").textContent = Math.round(totals.fats);

    // Bars
    const pP = Math.min((totals.protein / profile.protein) * 100, 100);
    const pC = Math.min((totals.carbs / profile.carbs) * 100, 100);
    const pF = Math.min((totals.fats / profile.fats) * 100, 100);
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
    const container = document.getElementById("weekly-chart");
    const data = WEIGHT_DATA;
    const weeklyChange = data[data.length - 1].weight - data[0].weight;
    const avgWeight = (data.reduce((s, d) => s + d.weight, 0) / data.length).toFixed(1);

    document.getElementById("weekly-avg").textContent = avgWeight;

    const badge = document.getElementById("weekly-trend-badge");
    const trendIcon = document.getElementById("trend-icon");
    const trendLabel = document.getElementById("trend-label");

    if (weeklyChange < -0.3) {
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

    drawLineChart(container, data, "day", "weight", " lbs");
  }

  // ── Today Log ────────────────────────────────────────────

  function renderTodayLog() {
    const el = document.getElementById("today-log");

    if (foodEntries.length === 0) {
      el.innerHTML =
        '<div class="empty-log">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        '<p>No meals logged yet today</p>' +
        '<p class="sub">Tap + to log your first meal</p>' +
        "</div>";
      return;
    }

    const grouped = {};
    foodEntries.forEach((e) => {
      if (!grouped[e.meal]) grouped[e.meal] = [];
      grouped[e.meal].push(e);
    });

    let html = "";
    for (const [meal, items] of Object.entries(grouped)) {
      const pTotal = items.reduce((s, e) => s + e.protein, 0);
      const cTotal = items.reduce((s, e) => s + e.carbs, 0);
      const fTotal = items.reduce((s, e) => s + e.fats, 0);
      html += '<div class="meal-group">';
      html += '<p class="meal-group-label">' + (MEAL_LABELS[meal] || meal) + "</p>";
      items.forEach((entry) => {
        html +=
          '<div class="meal-entry">' +
          '<span class="food-name">' + esc(entry.name) + "</span>" +
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
  }

  function renderMealChips() {
    const el = document.getElementById("meal-chips");
    el.innerHTML = MEALS.map(
      (m) =>
        '<button class="chip' +
        (selectedMeal === m.id ? " active" : "") +
        '" data-meal="' +
        m.id +
        '">' +
        m.label +
        "</button>"
    ).join("");
    el.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedMeal = btn.dataset.meal;
        renderMealChips();
      });
    });
  }

  function renderFoodList(filter) {
    const el = document.getElementById("food-list");
    const query = (filter || "").toLowerCase();
    const filtered = QUICK_FOODS.filter((f) => f.name.toLowerCase().includes(query));

    el.innerHTML = filtered
      .map(
        (f) =>
          '<button class="quick-food-item" data-food="' + esc(f.name) + '">' +
          '<span class="food-emoji">' + f.emoji + "</span>" +
          '<div class="food-info">' +
          '<p class="name">' + esc(f.name) + "</p>" +
          '<p class="macros">P: ' + f.protein + "g · C: " + f.carbs + "g · F: " + f.fats + "g</p>" +
          "</div>" +
          '<div class="food-cal-info">' +
          '<p class="cal-num font-display">' + f.calories + "</p>" +
          '<p class="cal-label">cal</p>' +
          "</div></button>"
      )
      .join("");

    el.querySelectorAll(".quick-food-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const food = QUICK_FOODS.find((f) => f.name === btn.dataset.food);
        if (!food) return;
        foodEntries.push({
          id: Date.now().toString(),
          name: food.name,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fats: food.fats,
          meal: selectedMeal,
        });
        updateCalorieRing();
        renderTodayLog();
        closeQuickLog();
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  // MEAL PLAN PAGE
  // ══════════════════════════════════════════════════════════

  function renderMeals() {
    document.getElementById("meals-macro-summary").textContent =
      profile.calories + " cal · " + profile.protein + "g P · " + profile.carbs + "g C · " + profile.fats + "g F";
    renderMealPlanOutput();
  }

  function renderMealPlanOutput() {
    const el = document.getElementById("meal-plan-output");

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

    const totals = mealPlanMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fats: acc.fats + m.fats,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

    let html =
      '<div class="daily-total-card">' +
      '<span class="dt-label">Daily Total</span>' +
      '<div class="dt-macros">' +
      '<span class="cal" style="font-weight:600">' + Math.round(totals.calories) + " cal</span>" +
      '<span class="p">' + Math.round(totals.protein) + "g P</span>" +
      '<span class="c">' + Math.round(totals.carbs) + "g C</span>" +
      '<span class="f">' + Math.round(totals.fats) + "g F</span>" +
      "</div></div>";

    mealPlanMeals.forEach((meal, i) => {
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
          .map(
            (ing) =>
              '<div class="ingredient-item"><span class="ing-name">' +
              esc(ing.name) +
              '</span><span class="ing-amount">' +
              esc(ing.amount) +
              "</span></div>"
          )
          .join("") +
        "</div></div></div>";
    });

    el.innerHTML = html;

    // Toggle expand
    el.querySelectorAll(".meal-plan-header").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = btn.dataset.mealIdx;
        const body = document.getElementById("mpb-" + idx);
        const icon = btn.querySelector(".expand-icon");
        body.classList.toggle("open");
        icon.classList.toggle("open");
      });
    });
  }

  async function generateMealPlan() {
    if (mealPlanLoading) return;
    mealPlanLoading = true;
    mealPlanMeals = [];
    renderMealPlanOutput();

    try {
      const prefs = document.getElementById("meal-preferences").value.trim();
      const res = await fetch(SUPABASE_URL + "/functions/v1/generate-meal-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
        },
        body: JSON.stringify({
          calories: profile.calories,
          protein: profile.protein,
          carbs: profile.carbs,
          fats: profile.fats,
          preferences: prefs || undefined,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      mealPlanMeals = (data.meals || []).sort(
        (a, b) => MEAL_PLAN_ORDER.indexOf(a.meal_type) - MEAL_PLAN_ORDER.indexOf(b.meal_type)
      );
    } catch (e) {
      console.error(e);
      const el = document.getElementById("meal-plan-output");
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
    const totalLost = WEEKLY_WEIGHTS[0].avg - WEEKLY_WEIGHTS[WEEKLY_WEIGHTS.length - 1].avg;

    const statsEl = document.getElementById("progress-stats");
    statsEl.innerHTML = [
      {
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--success))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
        value: totalLost.toFixed(1) + " lbs",
        label: "Lost",
      },
      {
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
        value: "12 days",
        label: "Streak",
      },
      {
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
        value: "4 weeks",
        label: "Duration",
      },
    ]
      .map(
        (s) =>
          '<div class="stat-card animate-in animate-delay-1">' +
          s.icon +
          '<p class="stat-value font-display">' + s.value + "</p>" +
          '<p class="stat-label">' + s.label + "</p></div>"
      )
      .join("");

    drawLineChart(document.getElementById("weight-trend-chart"), WEEKLY_WEIGHTS, "week", "avg", " lbs");
    drawBarChart(document.getElementById("adherence-chart"), ADHERENCE_DATA, "day", "pct", "%");
  }

  // ══════════════════════════════════════════════════════════
  // GOALS PAGE
  // ══════════════════════════════════════════════════════════

  function renderGoals() {
    document.getElementById("goals-calories").textContent = profile.calories;
    document.getElementById("goals-protein").textContent = profile.protein + "g";
    document.getElementById("goals-carbs").textContent = profile.carbs + "g";
    document.getElementById("goals-fats").textContent = profile.fats + "g";
  }

  // ══════════════════════════════════════════════════════════
  // SETTINGS PAGE
  // ══════════════════════════════════════════════════════════

  function renderSettings() {
    const items = [
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
        desc:
          (profile.goal === "lose" ? "Lose weight" : profile.goal === "gain" ? "Build muscle" : "Maintain") +
          " · " +
          profile.rate +
          " lb/week",
      },
      {
        id: "reminders",
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
        label: "Reminders",
        desc: profile.reminderEnabled ? "On · " + profile.reminderTime : "Off",
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

    const el = document.getElementById("settings-list");
    el.innerHTML =
      items
        .map(
          (item) =>
            '<button class="settings-item" data-panel="' + item.id + '">' +
            '<div class="settings-icon">' + item.icon + "</div>" +
            '<div class="settings-info">' +
            '<p class="title">' + item.label + "</p>" +
            '<p class="desc">' + esc(item.desc) + "</p></div>" +
            '<svg class="settings-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
            "</button>"
        )
        .join("") +
      '<button class="btn-destructive" id="btn-reset-onboarding" style="width:100%;margin-top:1rem">Reset Onboarding</button>';

    el.querySelectorAll(".settings-item").forEach((btn) => {
      btn.addEventListener("click", () => openSettingsPanel(btn.dataset.panel));
    });

    document.getElementById("btn-reset-onboarding").addEventListener("click", () => {
      updateProfile({ onboarded: false });
      showOnboarding();
    });
  }

  function openSettingsPanel(panelId) {
    const content = document.getElementById("settings-panel-content");
    let html =
      '<button class="back-btn" id="sp-back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg> Back</button>';

    if (panelId === "profile") {
      html += buildProfilePanel();
    } else if (panelId === "units") {
      html += buildUnitsPanel();
    } else if (panelId === "goal") {
      html += buildGoalPanel();
    } else if (panelId === "reminders") {
      html += buildRemindersPanel();
    } else if (panelId === "appearance") {
      html += buildAppearancePanel();
    } else if (panelId === "about") {
      html += buildAboutPanel();
    }

    content.innerHTML = html;

    document.getElementById("settings-overlay").classList.add("open");
    document.getElementById("settings-panel").classList.add("open");

    document.getElementById("sp-back").addEventListener("click", closeSettingsPanel);

    // Bind panel-specific events
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
    document.getElementById("sp-name").addEventListener("input", (e) => updateProfile({ name: e.target.value }));
    document.getElementById("sp-age").addEventListener("input", (e) => updateProfile({ age: parseInt(e.target.value) || 0 }));
    document.querySelectorAll("#settings-panel-content .sex-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateProfile({ sex: btn.dataset.sex });
        document.querySelectorAll("#settings-panel-content .sex-btn").forEach((b) => b.classList.toggle("selected", b.dataset.sex === profile.sex));
      });
    });
    document.getElementById("sp-hft").addEventListener("input", (e) => updateProfile({ heightFt: parseInt(e.target.value) || 0 }));
    document.getElementById("sp-hin").addEventListener("input", (e) => updateProfile({ heightIn: parseInt(e.target.value) || 0 }));
    document.getElementById("sp-weight").addEventListener("input", (e) => updateProfile({ weight: parseInt(e.target.value) || 0 }));
    document.getElementById("sp-recalc").addEventListener("click", () => {
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
    document.querySelectorAll("#settings-panel-content .selection-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateProfile({ units: btn.dataset.units });
        document.querySelectorAll("#settings-panel-content .selection-btn").forEach((b) => b.classList.toggle("selected", b.dataset.units === profile.units));
      });
    });
  }

  // ── Goal Panel ──
  function buildGoalPanel() {
    const goals = [
      { value: "lose", label: "Lose Weight", emoji: "📉" },
      { value: "maintain", label: "Maintain Weight", emoji: "⚖️" },
      { value: "gain", label: "Build Muscle", emoji: "💪" },
    ];
    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">Goal</h2>' +
      goals
        .map(
          (g) =>
            '<button class="selection-btn' + (profile.goal === g.value ? " selected" : "") + '" data-goal="' + g.value + '">' +
            '<div class="goal-option"><span class="emoji">' + g.emoji + "</span><p class='label-text'>" + g.label + "</p></div></button>"
        )
        .join("") +
      '<div id="sp-rate-section" style="' + (profile.goal === "maintain" ? "display:none" : "") + '">' +
      '<label class="label" style="margin-top:1rem">Rate: <span id="sp-rate-display">' + profile.rate + '</span> lb/week</label>' +
      '<div class="rate-selector">' +
      [0.5, 1, 1.5, 2]
        .map((r) => '<button class="rate-btn' + (profile.rate === r ? " selected" : "") + '" data-rate="' + r + '">' + r + "</button>")
        .join("") +
      "</div></div>" +
      '<button class="btn btn-primary" id="sp-update-goal" style="margin-top:1rem"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Update Targets</button>'
    );
  }

  function bindGoalPanel() {
    document.querySelectorAll("#settings-panel-content .selection-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateProfile({ goal: btn.dataset.goal });
        document.querySelectorAll("#settings-panel-content .selection-btn").forEach((b) => b.classList.toggle("selected", b.dataset.goal === profile.goal));
        document.getElementById("sp-rate-section").style.display = profile.goal === "maintain" ? "none" : "";
      });
    });
    document.querySelectorAll("#settings-panel-content .rate-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateProfile({ rate: parseFloat(btn.dataset.rate) });
        document.querySelectorAll("#settings-panel-content .rate-btn").forEach((b) => b.classList.toggle("selected", parseFloat(b.dataset.rate) === profile.rate));
        document.getElementById("sp-rate-display").textContent = profile.rate;
      });
    });
    document.getElementById("sp-update-goal").addEventListener("click", () => {
      recalculate();
      closeSettingsPanel();
    });
  }

  // ── Reminders Panel ──
  function buildRemindersPanel() {
    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">Reminders</h2>' +
      '<div class="card" style="display:flex;align-items:center;justify-content:space-between">' +
      "<div><p style='font-size:0.875rem;font-weight:500;color:hsl(var(--foreground))'>Meal Reminders</p>" +
      "<p style='font-size:0.75rem;color:hsl(var(--muted-foreground))'>Get nudged to log meals</p></div>" +
      '<button class="toggle' + (profile.reminderEnabled ? " on" : "") + '" id="sp-toggle-reminder"><div class="toggle-knob"></div></button>' +
      "</div>" +
      '<div id="sp-reminder-time" style="' + (profile.reminderEnabled ? "" : "display:none") + '">' +
      '<label class="label">Reminder Time</label>' +
      '<input type="time" class="input" id="sp-rtime" value="' + profile.reminderTime + '">' +
      "</div>"
    );
  }

  function bindRemindersPanel() {
    document.getElementById("sp-toggle-reminder").addEventListener("click", () => {
      updateProfile({ reminderEnabled: !profile.reminderEnabled });
      document.getElementById("sp-toggle-reminder").classList.toggle("on", profile.reminderEnabled);
      document.getElementById("sp-reminder-time").style.display = profile.reminderEnabled ? "" : "none";
    });
    document.getElementById("sp-rtime").addEventListener("input", (e) => {
      updateProfile({ reminderTime: e.target.value });
    });
  }

  // ── Appearance Panel ──
  function buildAppearancePanel() {
    const theme = getTheme();
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
    document.querySelectorAll("#settings-panel-content .selection-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        setTheme(btn.dataset.theme);
        document.querySelectorAll("#settings-panel-content .selection-btn").forEach((b) => b.classList.toggle("selected", b.dataset.theme === getTheme()));
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
    const W = container.clientWidth || 300;
    const H = container.clientHeight || 144;
    const pad = { top: 10, right: 15, bottom: 25, left: 15 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    const values = data.map((d) => d[valueKey]);
    const min = Math.min(...values) - 1;
    const max = Math.max(...values) + 1;
    const range = max - min || 1;

    const points = data.map((d, i) => ({
      x: pad.left + (i / (data.length - 1)) * innerW,
      y: pad.top + (1 - (d[valueKey] - min) / range) * innerH,
      label: d[labelKey],
      value: d[valueKey],
    }));

    const pathD = points.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");

    let svg =
      '<svg class="chart-svg" viewBox="0 0 ' + W + " " + H + '">' +
      '<path class="chart-line" d="' + pathD + '"/>';

    points.forEach((p, i) => {
      svg += '<circle class="chart-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" data-idx="' + i + '"/>';
    });

    // X labels
    data.forEach((d, i) => {
      const x = pad.left + (i / (data.length - 1)) * innerW;
      svg += '<text class="chart-label" x="' + x.toFixed(1) + '" y="' + (H - 4) + '">' + d[labelKey] + "</text>";
    });

    svg += "</svg>";
    svg += '<div class="chart-tooltip" id="tt-' + container.id + '"><p class="tooltip-label"></p><p class="tooltip-value"></p></div>';

    container.innerHTML = svg;

    // Tooltip events
    const tooltip = container.querySelector(".chart-tooltip");
    container.querySelectorAll(".chart-dot").forEach((dot) => {
      dot.addEventListener("mouseenter", () => {
        const idx = parseInt(dot.dataset.idx);
        const p = points[idx];
        tooltip.querySelector(".tooltip-label").textContent = p.label;
        tooltip.querySelector(".tooltip-value").textContent = p.value + (valueSuffix || "");
        tooltip.style.left = Math.min(p.x - 30, W - 80) + "px";
        tooltip.style.top = p.y - 45 + "px";
        tooltip.classList.add("visible");
      });
      dot.addEventListener("mouseleave", () => {
        tooltip.classList.remove("visible");
      });
    });
  }

  function drawBarChart(container, data, labelKey, valueKey, valueSuffix) {
    if (!container) return;
    const W = container.clientWidth || 300;
    const H = container.clientHeight || 144;
    const pad = { top: 10, right: 10, bottom: 25, left: 10 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    const maxVal = 120;
    const barW = (innerW / data.length) * 0.6;
    const gap = (innerW / data.length) * 0.4;

    let svg = '<svg class="chart-svg" viewBox="0 0 ' + W + " " + H + '">';

    data.forEach((d, i) => {
      const x = pad.left + (i / data.length) * innerW + gap / 2;
      const barH = (d[valueKey] / maxVal) * innerH;
      const y = pad.top + innerH - barH;
      svg +=
        '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" rx="4" data-idx="' + i + '"/>';
      svg +=
        '<text class="chart-label" x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 4) + '">' + d[labelKey] + "</text>";
    });

    svg += "</svg>";
    svg += '<div class="chart-tooltip" id="tt-' + container.id + '"><p class="tooltip-label"></p><p class="tooltip-value"></p></div>';

    container.innerHTML = svg;

    const tooltip = container.querySelector(".chart-tooltip");
    container.querySelectorAll(".chart-bar").forEach((bar) => {
      bar.addEventListener("mouseenter", () => {
        const idx = parseInt(bar.dataset.idx);
        const d = data[idx];
        tooltip.querySelector(".tooltip-label").textContent = d[labelKey];
        tooltip.querySelector(".tooltip-value").textContent = d[valueKey] + (valueSuffix || "");
        const x = parseFloat(bar.getAttribute("x"));
        const y = parseFloat(bar.getAttribute("y"));
        tooltip.style.left = Math.min(x - 20, W - 80) + "px";
        tooltip.style.top = y - 45 + "px";
        tooltip.classList.add("visible");
      });
      bar.addEventListener("mouseleave", () => {
        tooltip.classList.remove("visible");
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════════

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ══════════════════════════════════════════════════════════
  // EVENT BINDINGS
  // ══════════════════════════════════════════════════════════

  function init() {
    // Theme
    setTheme(getTheme());

    // Router
    window.addEventListener("hashchange", handleRoute);
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.page));
    });

    // Onboarding events
    document.getElementById("btn-get-started").addEventListener("click", obNext);
    document.getElementById("onboarding-back").addEventListener("click", obBack);

    // Basics step
    document.getElementById("ob-name").addEventListener("input", (e) => {
      updateProfile({ name: e.target.value });
      updateBasicsBtn();
    });
    document.getElementById("ob-age").addEventListener("input", (e) => updateProfile({ age: parseInt(e.target.value) || 0 }));
    document.querySelectorAll("#step-basics .sex-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateProfile({ sex: btn.dataset.sex });
        document.querySelectorAll("#step-basics .sex-btn").forEach((b) => b.classList.toggle("selected", b.dataset.sex === profile.sex));
      });
    });
    document.getElementById("btn-basics-next").addEventListener("click", obNext);

    // Body step
    document.getElementById("ob-height-ft").addEventListener("input", (e) => updateProfile({ heightFt: parseInt(e.target.value) || 0 }));
    document.getElementById("ob-height-in").addEventListener("input", (e) => updateProfile({ heightIn: parseInt(e.target.value) || 0 }));
    document.getElementById("ob-weight").addEventListener("input", (e) => updateProfile({ weight: parseInt(e.target.value) || 0 }));
    document.getElementById("btn-body-next").addEventListener("click", obNext);

    // Activity step
    document.querySelectorAll("#activity-options .selection-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateProfile({ activityLevel: btn.dataset.activity });
        document.querySelectorAll("#activity-options .selection-btn").forEach((b) => b.classList.toggle("selected", b.dataset.activity === profile.activityLevel));
      });
    });
    document.getElementById("btn-activity-next").addEventListener("click", obNext);

    // Goal step
    document.querySelectorAll("#goal-options .selection-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateProfile({ goal: btn.dataset.goal });
        document.querySelectorAll("#goal-options .selection-btn").forEach((b) => b.classList.toggle("selected", b.dataset.goal === profile.goal));
        document.getElementById("rate-section").style.display = profile.goal === "maintain" ? "none" : "";
      });
    });
    document.querySelectorAll("#step-goal .rate-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateProfile({ rate: parseFloat(btn.dataset.rate) });
        document.querySelectorAll("#step-goal .rate-btn").forEach((b) => b.classList.toggle("selected", parseFloat(b.dataset.rate) === profile.rate));
        document.getElementById("rate-display").textContent = profile.rate;
      });
    });
    document.getElementById("btn-goal-next").addEventListener("click", obNext);

    // Results / finish
    document.getElementById("btn-start-tracking").addEventListener("click", () => {
      const macros = calculateMacros(profile);
      updateProfile({ ...macros, onboarded: true });
      hideOnboarding();
    });

    // Calorie ring expand
    document.getElementById("calorie-ring-btn").addEventListener("click", toggleMacroBreakdown);

    // Quick log
    document.getElementById("fab-log").addEventListener("click", openQuickLog);
    document.getElementById("quicklog-overlay").addEventListener("click", closeQuickLog);
    document.getElementById("quicklog-close").addEventListener("click", closeQuickLog);
    document.getElementById("food-search").addEventListener("input", (e) => renderFoodList(e.target.value));

    // Settings panel overlay close
    document.getElementById("settings-overlay").addEventListener("click", closeSettingsPanel);

    // Meal plan generate
    document.getElementById("btn-generate-meal").addEventListener("click", generateMealPlan);

    // Start
    if (profile.onboarded) {
      document.getElementById("onboarding").style.display = "none";
      document.getElementById("bottom-nav").style.display = "";
      handleRoute();
    } else {
      showOnboarding();
    }
  }

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
