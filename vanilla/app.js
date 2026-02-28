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

  // Returns true on success, false on quota/serialisation failure.
  function cacheSet(key, data) {
    try {
      localStorage.setItem("mc_" + key, JSON.stringify({ data: data, ts: Date.now() }));
      return true;
    } catch (e) {
      console.warn("[MacroCore Cache] cacheSet failed for key '" + key + "':", e.name, e.message);
      return false;
    }
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

  // ── Native Bridge (Capacitor) ────────────────────────────
  var _Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};

  // Haptic feedback — silently ignored in browser
  function haptic(style) {
    if (!_Plugins.Haptics) return;
    try { _Plugins.Haptics.impact({ style: style || 'Medium' }); } catch (_) {}
  }

  // Offline banner visibility
  function setOfflineBanner(offline) {
    var el = document.getElementById('offline-banner');
    if (el) el.style.display = offline ? 'flex' : 'none';
  }

  // Start listening for connectivity changes
  async function initNetworkMonitoring() {
    if (!_Plugins.Network) return;
    try {
      var status = await _Plugins.Network.getStatus();
      setOfflineBanner(!status.connected);
      _Plugins.Network.addListener('networkStatusChange', function (s) {
        setOfflineBanner(!s.connected);
      });
    } catch (_) {}
  }

  // ══════════════════════════════════════════════════════════
  // PURCHASE MANAGER (JS)
  // Thin wrapper around the native PaywallPlugin Capacitor bridge.
  // Falls back gracefully when running in a browser / bridge unavailable.
  // ══════════════════════════════════════════════════════════

  var PurchaseManager = (function () {
    // Capacitor v8: plugins are accessed via window.Capacitor.Plugins
    function getPlugin() {
      return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Paywall) || null;
    }

    return {
      // Called at app start and on foreground. Resolves quickly from native cache.
      async refreshEntitlements() {
        var plugin = getPlugin();
        if (!plugin) return; // browser / no native bridge — keep cached value
        try {
          var res = await plugin.getEntitlementStatus();
          console.log("[Purchase] entitlement refresh → isPro:", res.isPro);
          setProUser(res.isPro);
        } catch (err) {
          console.warn("[Purchase] refreshEntitlements failed (non-fatal):", err.message);
        }
      },

      // Presents the native RevenueCatUI paywall sheet.
      // Returns { isPro, purchased }.
      async presentPaywall() {
        var plugin = getPlugin();
        if (!plugin) {
          // Fallback: show the in-app web paywall overlay.
          return new Promise(function (resolve) {
            openWebPaywall(function (result) { resolve(result); });
          });
        }
        try {
          var res = await plugin.presentPaywall();
          if (res.isPro !== undefined) setProUser(res.isPro);
          return res;
        } catch (err) {
          console.error("[Purchase] presentPaywall error:", err.message);
          // Non-fatal — user dismissed or cancelled; return current state.
          return { isPro: isProUser, purchased: false };
        }
      },

      // Triggers StoreKit restore through the native layer.
      async restorePurchases() {
        var plugin = getPlugin();
        if (!plugin) {
          showToast("Restore is only available on device.");
          return { isPro: isProUser };
        }
        try {
          var res = await plugin.restorePurchases();
          setProUser(res.isPro);
          // Distinct messaging for each restore outcome.
          if (res.restoreResult === "alreadyActive") {
            showToast("You\u2019re already subscribed to MacroCore Pro.");
          } else if (res.isPro) {
            showToast("Pro access restored!");
          } else {
            showToast("No active subscription found for this Apple\u00A0ID.");
          }
          return res;
        } catch (err) {
          console.error("[Purchase] restorePurchases error:", err.message);
          showToast("Restore failed: " + (err.message || "Please try again."));
          return { isPro: false };
        }
      },

      // Listen for entitlement changes fired by the native layer (e.g. after
      // a background purchase or subscription renewal).
      initListener() {
        var plugin = getPlugin();
        if (!plugin) return;
        try {
          plugin.addListener("entitlementChanged", function (data) {
            console.log("[Purchase] entitlementChanged event →", data);
            setProUser(data.isPro);
          });
        } catch (_) {}
      },
    };
  }());

  // Simple toast for purchase feedback (reuses auth-error pattern).
  function showToast(msg, durationMs) {
    var el = document.getElementById("toast-msg");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("visible");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () { el.classList.remove("visible"); }, durationMs || 3000);
  }

  // Native share sheet with Web Share API fallback
  async function shareProgress() {
    var today = todayStr();
    var consumed = foodEntries
      .filter(function (e) { return e.date === today; })
      .reduce(function (s, e) { return s + (e.calories || 0); }, 0);
    var pct = profile.calories ? Math.round((consumed / profile.calories) * 100) : 0;
    var goalLabel = profile.goal === 'lose' ? 'Fat loss' : profile.goal === 'gain' ? 'Muscle gain' : 'Maintenance';
    var text =
      'MacroCore — Week ' + getCurrentWeek() + '\n' +
      'Goal: ' + goalLabel + '\n' +
      'Today: ' + consumed + ' / ' + profile.calories + ' cal (' + pct + '%)\n' +
      'Protein: ' + profile.protein + 'g · Carbs: ' + profile.carbs + 'g · Fat: ' + profile.fats + 'g';

    if (_Plugins.Share) {
      try {
        await _Plugins.Share.share({ title: 'MacroCore Progress', text: text, dialogTitle: 'Share your progress' });
        return;
      } catch (_) {}
    }
    if (navigator.share) {
      try { navigator.share({ title: 'MacroCore Progress', text: text }); } catch (_) {}
    }
  }

  // ── State ────────────────────────────────────────────────
  let currentUser = null;
  let guestMode = false;

  // ── Pro entitlement (persisted in localStorage as mc_is_pro) ──
  // Bootstrapped from cache so the gate renders correctly before the
  // first RevenueCat network round-trip completes.
  let isProUser = (function () {
    try { return JSON.parse(localStorage.getItem("mc_is_pro") || "false"); } catch (_) { return false; }
  }());

  function setProUser(value) {
    isProUser = !!value;
    try { localStorage.setItem("mc_is_pro", JSON.stringify(isProUser)); } catch (_) {}
    updateGenerateButton();
  }
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
  let loggedMealIndices = new Set();

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
    var email = document.getElementById("auth-email").value.trim();
    var password = document.getElementById("auth-password").value;
    var btn = document.getElementById("auth-submit");
    var mode = authMode; // capture before any async mutation
    var diagStart = Date.now();

    btn.disabled = true;
    btn.textContent = mode === "signin" ? "Signing in..." : "Creating account...";
    document.getElementById("auth-error").style.display = "none";

    console.log("[MacroCore Auth] Starting " + mode + " at " + new Date().toISOString());

    // ── Pre-flight: network reachability ─────────────────────
    if (_Plugins.Network) {
      try {
        var netStatus = await _Plugins.Network.getStatus();
        console.log("[MacroCore Auth] Network connected:", netStatus.connected, "type:", netStatus.connectionType);
        if (!netStatus.connected) {
          showAuthError("No internet connection. Please check your network and try again.");
          btn.disabled = false;
          btn.textContent = mode === "signin" ? "Sign In" : "Sign Up";
          return;
        }
      } catch (netErr) {
        console.warn("[MacroCore Auth] Network check failed (non-fatal):", netErr.message);
      }
    }

    // ── 15-second timeout guard ───────────────────────────────
    var didTimeout = false;
    var timeoutHandle;
    var timeoutPromise = new Promise(function (_, reject) {
      timeoutHandle = setTimeout(function () {
        didTimeout = true;
        reject(new Error("Connection timed out. Please check your network and try again."));
      }, 15000);
    });

    try {
      var result;
      if (mode === "signup") {
        console.log("[MacroCore Auth] Calling supabase.auth.signUp...");
        result = await Promise.race([
          supabase.auth.signUp({ email: email, password: password }),
          timeoutPromise
        ]);
        clearTimeout(timeoutHandle);

        console.log("[MacroCore Auth] signUp response — status:", result.error ? "ERROR" : "OK",
          "| user:", !!result.data?.user, "| session:", !!result.data?.session,
          "| error:", result.error ? result.error.message : "none",
          "| elapsed:", (Date.now() - diagStart) + "ms");

        if (result.error) throw new Error(mapAuthError(result.error));
        // Guard: Supabase occasionally returns a 200 with a non-JSON body (CDN
        // hiccup, maintenance page) that the SDK surfaces as result.data === null.
        if (!result.data || typeof result.data !== "object") {
          throw new Error("Unexpected response from server. Please try again.");
        }

        if (result.data.user && !result.data.session) {
          // Supabase created the user but email confirmation is required.
          // Attempt an immediate sign-in — succeeds when "Confirm email" is OFF.
          console.log("[MacroCore Auth] No session after signUp — attempting immediate signIn...");
          var signInResult = await supabase.auth.signInWithPassword({ email: email, password: password });
          console.log("[MacroCore Auth] Immediate signIn:", signInResult.error ? signInResult.error.message : "OK");

          if (signInResult.error) {
            // Email confirmation IS required. Tell the user clearly and switch to sign-in mode.
            showAuthSuccess(
              "Account created! Check your inbox for a confirmation email, then come back and sign in."
            );
            btn.disabled = false;
            btn.textContent = "Sign In";
            applyAuthModeUI("signin");
            return;
          }
          // signInResult.data.session set — onAuthStateChange fires next
        }
        // If result.data.session is already set (confirm disabled), onAuthStateChange fires.

      } else {
        // Sign-in path
        console.log("[MacroCore Auth] Calling supabase.auth.signInWithPassword...");
        result = await Promise.race([
          supabase.auth.signInWithPassword({ email: email, password: password }),
          timeoutPromise
        ]);
        clearTimeout(timeoutHandle);

        console.log("[MacroCore Auth] signIn response — status:", result.error ? "ERROR" : "OK",
          "| error:", result.error ? result.error.message : "none",
          "| elapsed:", (Date.now() - diagStart) + "ms");

        if (result.error) throw new Error(mapAuthError(result.error));
      }

      console.log("[MacroCore Auth] Auth completed in", (Date.now() - diagStart) + "ms");
      // onAuthStateChange handles app boot from here

    } catch (err) {
      clearTimeout(timeoutHandle);
      console.error("[MacroCore Auth] Error after", (Date.now() - diagStart) + "ms:", err.message);
      showAuthError(err.message || "Authentication failed. Please try again.");
      btn.disabled = false;
      btn.textContent = mode === "signin" ? "Sign In" : "Sign Up";
    }
  }

  function showAuthSuccess(msg) {
    var el = document.getElementById("auth-error");
    el.textContent = msg;
    el.style.display = "block";
    el.style.background = "hsl(var(--success) / 0.1)";
    el.style.color = "hsl(var(--success))";
  }

  // Maps raw Supabase/network errors to actionable user-facing messages.
  // KEEP IN SYNC with src/lib/authUtils.ts (tested there).
  function mapAuthError(error) {
    // Guard: non-object or null error — shouldn't happen but protects against
    // malformed/non-JSON Supabase responses that arrive as bare strings.
    if (!error || typeof error !== "object") {
      return typeof error === "string" && error.length < 200
        ? error
        : "Authentication failed. Please try again.";
    }
    var msg = (error.message || "").toLowerCase();
    var status = error.status || (error.context && error.context.status) || 0;

    // Network / connectivity
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch") || msg.includes("load failed") || msg.includes("networkrequesterror")) {
      return "Unable to connect. Please check your internet connection and try again.";
    }
    // Timeout (our guard + Supabase SDK timeout strings)
    if (msg.includes("timed out") || msg.includes("timeout")) {
      return "Connection timed out. Please check your network and try again.";
    }
    // Server unavailable / maintenance
    if (status === 503 || msg.includes("service unavailable") || msg.includes("maintenance")) {
      return "MacroCore is temporarily unavailable. Please try again in a few minutes.";
    }
    // Rate limiting
    if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
      return "Too many attempts. Please wait a minute and try again.";
    }
    // Email not confirmed
    if (msg.includes("email not confirmed")) {
      return "Please confirm your email first — check your inbox, then sign in here.";
    }
    // Invalid credentials
    if (msg.includes("invalid login credentials") || msg.includes("invalid credentials") || msg.includes("invalid email or password")) {
      return "Incorrect email or password. Please check your details and try again.";
    }
    // Duplicate email
    if (msg.includes("user already registered") || msg.includes("already been registered") || msg.includes("already exists")) {
      return "An account with this email already exists. Please sign in instead.";
    }
    // Weak password
    if (msg.includes("password should be at least") || (msg.includes("password") && msg.includes("characters"))) {
      return "Password must be at least 6 characters.";
    }
    // Invalid email format
    if (msg.includes("unable to validate email") || (msg.includes("invalid") && msg.includes("email"))) {
      return "Please enter a valid email address.";
    }
    // Signups disabled
    if (msg.includes("signup is disabled") || msg.includes("signups not allowed")) {
      return "Account creation is temporarily unavailable. Please try again later.";
    }
    // Catch-all: surface the raw message if short enough to be user-readable,
    // otherwise show a generic message (avoids leaking internal SDK strings).
    return (error.message && error.message.length < 120)
      ? error.message
      : "Authentication failed. Please try again.";
  }

  // Updates auth UI chrome without toggling — safe to call mid-flow
  function applyAuthModeUI(mode) {
    authMode = mode;
    var isSignUp = mode === "signup";
    document.getElementById("auth-title").textContent = isSignUp ? "Create Account" : "Welcome to MacroCore";
    document.getElementById("auth-subtitle").textContent = isSignUp ? "Sign up to get started" : "Sign in to sync your data across devices";
    document.getElementById("auth-submit").textContent = isSignUp ? "Sign Up" : "Sign In";
    document.getElementById("auth-toggle-text").textContent = isSignUp ? "Already have an account?" : "Don't have an account?";
    document.getElementById("auth-toggle-btn").textContent = isSignUp ? "Sign In" : "Sign Up";
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

  function handleGuestLogin() {
    guestMode = true;
    currentUser = null;
    startApp();
  }

  function handleGuestSignOut() {
    guestMode = false;
    currentUser = null;
    profile = { ...DEFAULT_PROFILE };
    foodEntries = [];
    weightLogs = [];
    mealPlanMeals = [];
    adjustments = [];
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
  // WEEKLY AUTO-ADJUST
  // ══════════════════════════════════════════════════════════

  function checkWeeklyAutoAdjust() {
    if (!currentUser || !profile.onboarded) return;

    // Run at most once per day
    if (cacheGet("lastAutoAdjustCheck") === todayStr()) return;
    cacheSet("lastAutoAdjustCheck", todayStr());

    // Need at least 7 days since onboarding
    if (!profile.startedAt) return;
    if (Date.now() - new Date(profile.startedAt).getTime() < 7 * 24 * 60 * 60 * 1000) return;

    // Need 7+ days since last adjustment (manual or auto)
    var lastAdjTime = new Date(profile.startedAt).getTime();
    if (adjustments.length > 0) {
      var sortedAdj = adjustments.slice().sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
      lastAdjTime = new Date(sortedAdj[0].created_at).getTime();
    }
    if ((Date.now() - lastAdjTime) / (24 * 60 * 60 * 1000) < 7) return;

    // Collect last 7 day strings
    var dayStrings = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      dayStrings.push(d.toISOString().slice(0, 10));
    }

    // Weight: need 2+ entries from the past 7 days
    var recentWeights = weightLogs
      .filter(function (w) { return dayStrings.indexOf(w.date) !== -1; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (recentWeights.length < 2) return;

    // Food adherence: need 4+ days logged
    var foodDays = 0;
    var totalAdh = 0;
    dayStrings.forEach(function (dateStr) {
      var entries = dateStr === todayStr() ? foodEntries : (cacheGet("food_" + dateStr) || []);
      if (entries.length > 0) {
        foodDays++;
        var cals = entries.reduce(function (s, e) { return s + (e.calories || 0); }, 0);
        totalAdh += cals / profile.calories;
      }
    });
    if (foodDays < 4) return;

    var avgAdherence = totalAdh / foodDays;
    var actualChange = recentWeights[recentWeights.length - 1].weight - recentWeights[0].weight;
    var rate = profile.rate || 1;
    var goal = profile.goal;

    var delta = 0;
    var reason = "";

    if (goal === "lose") {
      if (avgAdherence < 0.7) return; // not following plan — skip
      if (actualChange > 0.5) {
        delta = -100;
        reason = "Gained weight while hitting your targets";
      } else if (actualChange < -(rate * 1.5)) {
        delta = 75;
        reason = "Losing faster than your target rate — keeping it sustainable";
      } else if (actualChange > -(rate * 0.5)) {
        delta = -50;
        reason = "Progress slower than expected";
      } else {
        return; // on track
      }
    } else if (goal === "gain") {
      if (avgAdherence < 0.7) return;
      if (actualChange < -0.5) {
        delta = 100;
        reason = "Lost weight while hitting your targets";
      } else if (actualChange > rate * 1.5) {
        delta = -75;
        reason = "Gaining faster than your target rate";
      } else if (actualChange < rate * 0.5) {
        delta = 50;
        reason = "Gains slower than expected";
      } else {
        return;
      }
    } else { // maintain
      if (actualChange > 2) {
        delta = -75;
        reason = "Weight trending up";
      } else if (actualChange < -2) {
        delta = 75;
        reason = "Weight trending down";
      } else {
        return;
      }
    }

    var minCals = profile.sex === "female" ? 1200 : 1500;
    var newCals = Math.max(minCals, profile.calories + delta);
    if (newCals === profile.calories) return;

    var newFats = Math.round(Math.max((newCals * 0.25) / 9, 30));
    var newCarbs = Math.round(Math.max((newCals - profile.protein * 4 - newFats * 9) / 4, 50));

    var oldMacros = { calories: profile.calories, protein: profile.protein, carbs: profile.carbs, fats: profile.fats };
    var newMacros = { calories: newCals, protein: profile.protein, carbs: newCarbs, fats: newFats };

    updateProfile(newMacros);
    addAdjustment(oldMacros, newMacros, "Week " + getCurrentWeek() + " auto-adjust: " + reason);

    cacheSet("pendingAdjustNotif", {
      calChange: newCals - oldMacros.calories,
      reason: reason,
      week: getCurrentWeek(),
    });
  }

  function renderAdjustNotif() {
    var el = document.getElementById("adjust-notif");
    if (!el) return;
    var notif = cacheGet("pendingAdjustNotif");
    if (!notif) { el.innerHTML = ""; return; }

    var sign = notif.calChange > 0 ? "+" : "";
    var calColor = notif.calChange > 0 ? "hsl(var(--success))" : "hsl(var(--destructive))";

    el.innerHTML =
      '<div class="adjust-banner">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
      '<div class="adjust-banner-body">' +
      '<p class="adjust-banner-title">Week ' + notif.week + ' targets updated &nbsp;<span style="color:' + calColor + ';font-weight:700">' + sign + notif.calChange + ' cal</span></p>' +
      '<p class="adjust-banner-msg">' + esc(notif.reason) + ' — tap Goals to review your new targets.</p>' +
      '</div>' +
      '<button class="adjust-banner-dismiss" id="btn-dismiss-notif" aria-label="Dismiss">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
      '</button></div>';

    document.getElementById("btn-dismiss-notif").addEventListener("click", function () {
      cacheRemove("pendingAdjustNotif");
      el.innerHTML = "";
    });
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

  async function loadRecentFoodEntriesFromSupabase() {
    if (!currentUser) return;
    try {
      var today = todayStr();
      var start = new Date();
      start.setDate(start.getDate() - 6);
      var startStr = start.toISOString().slice(0, 10);
      var { data } = await supabase.from("food_entries")
        .select("*")
        .eq("user_id", currentUser.id)
        .gte("logged_at", startStr)
        .lt("logged_at", today)
        .order("logged_at", { ascending: true });
      if (data && data.length > 0) {
        var byDate = {};
        data.forEach(function (row) {
          if (!byDate[row.logged_at]) byDate[row.logged_at] = [];
          byDate[row.logged_at].push({ id: row.id, name: row.name, calories: row.calories, protein: row.protein, carbs: row.carbs, fats: row.fats, meal: row.meal });
        });
        Object.keys(byDate).forEach(function (date) {
          cacheSet("food_" + date, byDate[date]);
        });
      }
    } catch (_) { /* silent */ }
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
    window.location.hash = "home";
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
    renderAdjustNotif();
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

  var SPARKLE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/><path d="M5 18l.75 2.25L8 21l-2.25.75L5 24l-.75-2.25L2 21l2.25-.75z"/></svg>';

  async function lookupFoodMacros() {
    var nameInput = document.getElementById("custom-food-name");
    var desc = nameInput.value.trim();
    if (!desc) return;
    var btn = document.getElementById("btn-lookup-macros");
    var statusEl = document.getElementById("lookup-status");
    btn.disabled = true;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
    statusEl.style.color = "hsl(var(--muted-foreground))";
    statusEl.textContent = "Looking up macros\u2026";
    try {
      var result = await supabase.functions.invoke("lookup-food-macros", { body: { description: desc } });
      var data = result.data;
      var error = result.error;
      if (error) {
        var errMsg = error.message || "Request failed";
        if (error.context) {
          try { var errBody = await error.context.json(); if (errBody && errBody.error) errMsg = errBody.error; } catch (_) {}
        }
        throw new Error(errMsg);
      }
      if (data && data.error) throw new Error(data.error);
      if (!data || !data.calories) throw new Error("No macro data returned");
      nameInput.value = data.name || desc;
      document.getElementById("custom-food-cal").value = Math.round(data.calories) || "";
      document.getElementById("custom-food-protein").value = Math.round(data.protein * 10) / 10 || "";
      document.getElementById("custom-food-carbs").value = Math.round(data.carbs * 10) / 10 || "";
      document.getElementById("custom-food-fats").value = Math.round(data.fats * 10) / 10 || "";
      statusEl.style.color = "hsl(var(--success, 142 71% 45%))";
      statusEl.textContent = "\u2713 Macros filled in \u2014 review and log!";
    } catch (e) {
      statusEl.style.color = "hsl(var(--destructive))";
      statusEl.textContent = e.message || "Couldn\u2019t look up macros. Enter them manually.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = SPARKLE_ICON;
    }
  }

  function addCustomFood() {
    var name = document.getElementById("custom-food-name").value.trim();
    var cal = parseFloat(document.getElementById("custom-food-cal").value) || 0;
    var protein = parseFloat(document.getElementById("custom-food-protein").value) || 0;
    var carbs = parseFloat(document.getElementById("custom-food-carbs").value) || 0;
    var fats = parseFloat(document.getElementById("custom-food-fats").value) || 0;
    if (!name || cal <= 0) return;
    var food = { name: name, calories: Math.round(cal), protein: Math.round(protein * 10) / 10, carbs: Math.round(carbs * 10) / 10, fats: Math.round(fats * 10) / 10 };
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
    updateGenerateButton();
  }

  // Updates the generate button to reflect current entitlement.
  // Called after any isPro change so the UI always matches state.
  function updateGenerateButton() {
    var btn = document.getElementById("btn-generate-meal");
    if (!btn) return;
    if (isProUser) {
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>' +
        "Generate Meal Plan";
      btn.removeAttribute("data-locked");
    } else {
      btn.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        "\u00A0Pro \u2014 Generate Meal Plan";
      btn.setAttribute("data-locked", "1");
    }
  }

  // ── Web paywall fallback ──────────────────────────────────
  // Shown only when the native Capacitor bridge is unavailable
  // (e.g. dev browser, Simulator without StoreKit config, or RC offline).
  var _webPaywallResolve = null;

  function openWebPaywall(resolve) {
    _webPaywallResolve = resolve;
    document.getElementById("paywall-overlay").classList.remove("hidden");
  }

  function closeWebPaywall(purchased) {
    document.getElementById("paywall-overlay").classList.add("hidden");
    if (_webPaywallResolve) {
      _webPaywallResolve({ isPro: isProUser, purchased: !!purchased });
      _webPaywallResolve = null;
    }
  }

  // Populates the pricing card and CTA button from RevenueCat offerings.
  // Runs when the web paywall becomes visible.
  async function loadWebPaywallOfferings() {
    var plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Paywall;
    var pricingEl = document.getElementById("paywall-pricing");
    var ctaBtn = document.getElementById("btn-paywall-subscribe");
    if (!plugin || !pricingEl || !ctaBtn) return;

    try {
      var res = await plugin.getOfferings(); // custom call; see PaywallPlugin.swift
      var pkgs = (res && res.packages) || [];
      var pkg = pkgs[0]; // use first package from default offering

      if (pkg) {
        pricingEl.innerHTML =
          '<div class="paywall-price-card">' +
          (pkgs.length === 1 ? '<span class="paywall-price-badge">Most Popular</span>' : '') +
          '<p class="price-label">' + esc(pkg.title || "Pro") + '</p>' +
          '<p><span class="price-amount">' + esc(pkg.localizedPriceString) + '</span>' +
          '<span class="price-period"> / ' + (pkg.subscriptionPeriod || "month") + '</span></p>' +
          '</div>';

        ctaBtn.textContent = "Subscribe for " + pkg.localizedPriceString;
        ctaBtn.onclick = async function () {
          ctaBtn.disabled = true;
          ctaBtn.textContent = "Processing…";
          try {
            var purchaseRes = await plugin.purchase({ packageIdentifier: pkg.identifier });
            if (purchaseRes.isPro !== undefined) setProUser(purchaseRes.isPro);
            if (purchaseRes.isPro) closeWebPaywall(true);
          } catch (err) {
            showToast(err.message || "Purchase failed. Please try again.");
          } finally {
            ctaBtn.disabled = false;
            ctaBtn.textContent = "Subscribe for " + pkg.localizedPriceString;
          }
        };
      } else {
        pricingEl.innerHTML = '<p style="color:hsl(var(--muted-foreground));font-size:0.875rem">Pricing unavailable. Please try again.</p>';
        ctaBtn.textContent = "Try Again";
        ctaBtn.onclick = function () { loadWebPaywallOfferings(); };
      }
    } catch (err) {
      console.warn("[Paywall] Could not load offerings:", err.message);
      pricingEl.innerHTML = '<p style="color:hsl(var(--muted-foreground));font-size:0.875rem">Could not load pricing. Check your connection.</p>';
      ctaBtn.textContent = "Retry";
      ctaBtn.onclick = function () { loadWebPaywallOfferings(); };
    }
  }

  // Expose so openWebPaywall can trigger it.
  var _originalOpenWebPaywall = openWebPaywall;
  openWebPaywall = function (resolve) { // eslint-disable-line no-func-assign
    _originalOpenWebPaywall(resolve);
    loadWebPaywallOfferings();
  };

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

  var MEAL_TYPE_TO_SLOT = {
    breakfast: "breakfast",
    morning_snack: "snack",
    lunch: "lunch",
    afternoon_snack: "snack",
    dinner: "dinner",
  };

  function logMealPlanItem(idx) {
    var meal = mealPlanMeals[idx];
    if (!meal || loggedMealIndices.has(idx)) return;
    var slot = MEAL_TYPE_TO_SLOT[meal.meal_type] || "snack";
    addFoodEntry({
      name: meal.name,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fats: meal.fats,
    }, slot);
    loggedMealIndices.add(idx);
    updateCalorieRing();
    renderTodayLog();
    // Update just this button
    var btn = document.querySelector('[data-log-idx="' + idx + '"]');
    if (btn) {
      btn.textContent = "\u2713 Added";
      btn.classList.add("logged");
      btn.disabled = true;
    }
    // Update "Log Full Day" button
    var allLogged = mealPlanMeals.length > 0 && loggedMealIndices.size === mealPlanMeals.length;
    var logAllBtn = document.getElementById("btn-log-all-meals");
    if (logAllBtn) {
      if (allLogged) {
        logAllBtn.textContent = "\u2713 All Meals Logged";
        logAllBtn.disabled = true;
      }
    }
  }

  function logAllMealPlan() {
    if (mealPlanMeals.length === 0) return;
    mealPlanMeals.forEach(function (_, i) { logMealPlanItem(i); });
    navigate("home");
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

    var allAlreadyLogged = mealPlanMeals.length > 0 && loggedMealIndices.size === mealPlanMeals.length;

    var html =
      '<div class="daily-total-card">' +
      '<div class="dt-top">' +
      '<span class="dt-label">Daily Total</span>' +
      '<button id="btn-log-all-meals" class="btn-log-all' + (allAlreadyLogged ? " logged" : "") + '"' + (allAlreadyLogged ? " disabled" : "") + '>' +
      (allAlreadyLogged ? "\u2713 All Logged" : "Log Full Day") +
      "</button></div>" +
      '<div class="dt-macros">' +
      '<span class="cal" style="font-weight:600">' + Math.round(totals.calories) + " cal</span>" +
      '<span class="p">' + Math.round(totals.protein) + "g P</span>" +
      '<span class="c">' + Math.round(totals.carbs) + "g C</span>" +
      '<span class="f">' + Math.round(totals.fats) + "g F</span>" +
      "</div></div>";

    mealPlanMeals.forEach(function (meal, i) {
      var isLogged = loggedMealIndices.has(i);
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
        '<button class="btn-log-meal' + (isLogged ? " logged" : "") + '" data-log-idx="' + i + '"' + (isLogged ? " disabled" : "") + '>' +
        (isLogged ? "\u2713 Added to Today" : "+ Add to Today") +
        "</button></div></div></div>";
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

    el.querySelectorAll(".btn-log-meal").forEach(function (btn) {
      btn.addEventListener("click", function () {
        logMealPlanItem(parseInt(btn.dataset.logIdx));
      });
    });

    var logAllBtn = document.getElementById("btn-log-all-meals");
    if (logAllBtn) logAllBtn.addEventListener("click", logAllMealPlan);

    // ── Archive button ────────────────────────────────────────
    var archiveBtn = document.createElement("button");
    archiveBtn.className = "archive-btn";
    archiveBtn.id = "btn-archive-plan";
    archiveBtn.setAttribute("aria-label", "Archive this meal plan");
    var alreadySaved = isCurrentPlanArchived();
    archiveBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>' +
      (alreadySaved ? "Saved to Archive" : "Archive Plan");
    if (alreadySaved) archiveBtn.classList.add("saved");
    archiveBtn.addEventListener("click", function () { haptic("Light"); archiveCurrentPlan(archiveBtn); });
    el.appendChild(archiveBtn);
  }

  // ══════════════════════════════════════════════════════════
  // ARCHIVE
  // ══════════════════════════════════════════════════════════

  var PLAN_TAGS = ["Cut", "Bulk", "Maintain", "High-Protein", "Low-Bloat", "Anti-Inflammatory", "Vegetarian", "Vegan"];

  function getArchivedPlans() {
    return cacheGet("archived_plans") || [];
  }

  // Returns true on success, false if localStorage quota was exceeded.
  function saveArchivedPlans(plans) {
    var ok = cacheSet("archived_plans", plans);
    updateArchiveBadge();
    return ok;
  }

  function updateArchiveBadge() {
    var badge = document.getElementById("archive-badge");
    if (!badge) return;
    var count = getArchivedPlans().length;
    badge.style.display = count > 0 ? "block" : "none";
  }

  function isCurrentPlanArchived() {
    if (!mealPlanMeals || mealPlanMeals.length === 0) return false;
    // Fingerprint by meal names (order-independent)
    var names = mealPlanMeals.map(function (m) { return m.name; }).sort().join("|");
    return getArchivedPlans().some(function (p) {
      return p.meals && p.meals.map(function (m) { return m.name; }).sort().join("|") === names;
    });
  }

  function archiveCurrentPlan(btn) {
    if (!mealPlanMeals || mealPlanMeals.length === 0) return;
    if (isCurrentPlanArchived()) return; // already saved

    var plans = getArchivedPlans();
    var totals = mealPlanMeals.reduce(function (acc, m) {
      return {
        calories: acc.calories + (m.calories || 0),
        protein:  acc.protein  + (m.protein  || 0),
        carbs:    acc.carbs    + (m.carbs    || 0),
        fats:     acc.fats     + (m.fats     || 0),
      };
    }, { calories: 0, protein: 0, carbs: 0, fats: 0 });

    var goalTag = profile.goal === "lose" ? "Cut" : profile.goal === "gain" ? "Bulk" : "Maintain";
    var dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    var prefs = (document.getElementById("meal-preferences") && document.getElementById("meal-preferences").value.trim()) || "";

    // Auto-tags: goal + detect high-protein
    var tags = [goalTag];
    if (profile.protein && totals.protein >= profile.protein * 0.9) tags.push("High-Protein");
    if (prefs) {
      if (/vegan/i.test(prefs)) tags.push("Vegan");
      else if (/vegetarian/i.test(prefs)) tags.push("Vegetarian");
      if (/low.?bloat/i.test(prefs)) tags.push("Low-Bloat");
      if (/anti.?inflam/i.test(prefs)) tags.push("Anti-Inflammatory");
    }

    var plan = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: goalTag + " Plan \u2014 " + dateStr,
      createdAt: new Date().toISOString(),
      tags: tags,
      preferences: prefs,
      meals: mealPlanMeals.slice(),
      macros: {
        calories: Math.round(totals.calories),
        protein:  Math.round(totals.protein),
        carbs:    Math.round(totals.carbs),
        fats:     Math.round(totals.fats),
      },
    };

    plans.unshift(plan);
    if (plans.length > 50) plans = plans.slice(0, 50);
    var saved = saveArchivedPlans(plans);

    if (!saved) {
      // Storage quota exceeded — try evicting the oldest plan to make room.
      var trimmed = plans.slice(0, Math.max(1, plans.length - 5));
      var savedAfterTrim = saveArchivedPlans(trimmed);
      if (!savedAfterTrim) {
        // Still can't write — tell the user.
        if (btn) {
          btn.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--destructive))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg> Save failed — storage full';
          btn.style.borderColor = "hsl(var(--destructive))";
          btn.style.color = "hsl(var(--destructive))";
        }
        showToast("Archive save failed: your device storage may be full. Try deleting old plans.");
        return;
      }
    }

    if (btn) {
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Saved to Archive';
      btn.classList.add("saved");
    }

    // Optional Supabase sync
    syncArchivedPlanToSupabase(plan);
  }

  async function syncArchivedPlanToSupabase(plan) {
    if (!currentUser) return;
    try {
      await supabase.from("archived_plans").upsert({
        id: plan.id,
        user_id: currentUser.id,
        title: plan.title,
        created_at: plan.createdAt,
        tags: plan.tags,
        preferences: plan.preferences,
        meals: plan.meals,
        macros: plan.macros,
      });
    } catch (_) { /* local storage is the source of truth */ }
  }

  function deleteArchivedPlan(id) {
    var plans = getArchivedPlans().filter(function (p) { return p.id !== id; });
    saveArchivedPlans(plans);
    if (currentUser) {
      supabase.from("archived_plans").delete().eq("id", id).catch(function () {});
    }
  }

  // ── Archive overlay UI ────────────────────────────────────

  var archiveSearchQuery = "";
  var archiveActiveTag = null;
  var archiveDetailPlanId = null;

  function openArchive() {
    archiveSearchQuery = "";
    archiveActiveTag = null;
    document.getElementById("archive-search").value = "";
    renderArchiveList();
    document.getElementById("archive-overlay").classList.remove("hidden");
  }

  function closeArchive() {
    document.getElementById("archive-overlay").classList.add("hidden");
  }

  function openArchiveDetail(id) {
    var plan = getArchivedPlans().find(function (p) { return p.id === id; });
    if (!plan) return;
    archiveDetailPlanId = id;
    document.getElementById("archive-detail-title").textContent = plan.title;
    var content = document.getElementById("archive-detail-content");

    var macroRow =
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">' +
      '<span class="archive-macro-chip">' + plan.macros.calories + ' cal</span>' +
      '<span class="archive-macro-chip">' + plan.macros.protein + 'g P</span>' +
      '<span class="archive-macro-chip">' + plan.macros.carbs + 'g C</span>' +
      '<span class="archive-macro-chip">' + plan.macros.fats + 'g F</span>' +
      '</div>';

    var tagsHtml = plan.tags && plan.tags.length
      ? '<div class="archive-tags" style="margin-bottom:1rem">' +
        plan.tags.map(function (t) { return '<span class="archive-tag">' + esc(t) + '</span>'; }).join("") +
        '</div>'
      : "";

    var dateHtml = '<p style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin-bottom:1rem">' +
      new Date(plan.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
      '</p>';

    var mealsHtml = (plan.meals || []).map(function (meal) {
      return '<div class="card" style="margin-bottom:0.75rem">' +
        '<p style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:hsl(var(--muted-foreground));margin-bottom:0.25rem">' +
        esc(MEAL_PLAN_LABELS[meal.meal_type] || meal.meal_type) + '</p>' +
        '<p style="font-size:0.9375rem;font-weight:600;color:hsl(var(--foreground));margin-bottom:0.5rem">' + esc(meal.name) + '</p>' +
        '<div class="meal-macros" style="margin-bottom:0.625rem">' +
        '<span class="cal">' + meal.calories + ' cal</span>' +
        '<span class="p">' + meal.protein + 'g P</span>' +
        '<span class="c">' + meal.carbs + 'g C</span>' +
        '<span class="f">' + meal.fats + 'g F</span>' +
        '</div>' +
        '<p class="ingredients-label">Ingredients</p>' +
        (meal.ingredients || []).map(function (ing) {
          return '<div class="ingredient-item"><span class="ing-name">' + esc(ing.name) + '</span><span class="ing-amount">' + esc(ing.amount) + '</span></div>';
        }).join("") +
        '</div>';
    }).join("");

    content.innerHTML = dateHtml + macroRow + tagsHtml + mealsHtml;
    document.getElementById("archive-detail-overlay").classList.remove("hidden");
  }

  function closeArchiveDetail() {
    document.getElementById("archive-detail-overlay").classList.add("hidden");
    archiveDetailPlanId = null;
  }

  function renderArchiveList() {
    var plans = getArchivedPlans();

    // Collect all unique tags for filter chips
    var allTags = [];
    plans.forEach(function (p) {
      (p.tags || []).forEach(function (t) {
        if (!allTags.includes(t)) allTags.push(t);
      });
    });

    var filterEl = document.getElementById("archive-tag-filters");
    filterEl.innerHTML = allTags.map(function (tag) {
      var active = tag === archiveActiveTag;
      return '<button class="archive-tag-filter' + (active ? " active" : "") + '" data-tag="' + esc(tag) + '">' + esc(tag) + '</button>';
    }).join("");
    filterEl.querySelectorAll(".archive-tag-filter").forEach(function (btn) {
      btn.addEventListener("click", function () {
        archiveActiveTag = btn.dataset.tag === archiveActiveTag ? null : btn.dataset.tag;
        renderArchiveList();
      });
    });

    // Filter by search + tag
    var q = archiveSearchQuery.trim().toLowerCase();
    if (q) {
      plans = plans.filter(function (p) {
        return p.title.toLowerCase().includes(q) ||
          (p.preferences || "").toLowerCase().includes(q) ||
          (p.tags || []).some(function (t) { return t.toLowerCase().includes(q); });
      });
    }
    if (archiveActiveTag) {
      plans = plans.filter(function (p) { return (p.tags || []).includes(archiveActiveTag); });
    }

    var listEl = document.getElementById("archive-list");
    if (plans.length === 0) {
      listEl.innerHTML = '<div class="archive-empty">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 0.75rem"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>' +
        '<p>' + (q || archiveActiveTag ? "No plans match your search." : "No saved plans yet.<br>Generate a meal plan and tap <strong>Archive Plan</strong> to save it here.") + '</p>' +
        '</div>';
      return;
    }

    listEl.innerHTML = plans.map(function (plan) {
      var dateStr = new Date(plan.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      var tagsHtml = (plan.tags || []).map(function (t) {
        return '<span class="archive-tag">' + esc(t) + '</span>';
      }).join("");
      return '<div class="archive-card" tabindex="0" role="button" data-plan-id="' + esc(plan.id) + '">' +
        '<p class="archive-card-title">' + esc(plan.title) + '</p>' +
        '<p class="archive-card-date">' + dateStr + '</p>' +
        '<div class="archive-card-macros">' +
        '<span class="archive-macro-chip">' + plan.macros.calories + ' cal</span>' +
        '<span class="archive-macro-chip">' + plan.macros.protein + 'g P</span>' +
        '<span class="archive-macro-chip">' + plan.macros.carbs + 'g C</span>' +
        '<span class="archive-macro-chip">' + plan.macros.fats + 'g F</span>' +
        '</div>' +
        (tagsHtml ? '<div class="archive-tags">' + tagsHtml + '</div>' : '') +
        '</div>';
    }).join("");

    listEl.querySelectorAll(".archive-card").forEach(function (card) {
      card.addEventListener("click", function () { haptic("Light"); openArchiveDetail(card.dataset.planId); });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openArchiveDetail(card.dataset.planId); }
      });
    });
  }

  async function generateMealPlan() {
    // ── Entitlement gate ─────────────────────────────────────
    if (!isProUser) {
      console.log("[Purchase] Generate tapped — not Pro. Presenting paywall.");
      haptic("Medium");
      var result = await PurchaseManager.presentPaywall();
      if (!result.isPro) return; // still not Pro after paywall dismissed
    }
    // ──────────────────────────────────────────────────────────
    if (mealPlanLoading) return;
    mealPlanLoading = true;
    mealPlanMeals = [];
    savedMealPlanId = null;
    loggedMealIndices = new Set();

    // Disable the generate button for the duration of the request.
    var genBtn = document.getElementById("btn-generate-meal");
    if (genBtn) { genBtn.disabled = true; genBtn.setAttribute("aria-busy", "true"); }

    renderMealPlanOutput();

    // 30-second hard timeout — Supabase Functions default is 60 s which is too long
    // to block the UI with a spinner; surface an actionable message at 30 s instead.
    var genTimeoutHandle;
    var genTimeoutPromise = new Promise(function (_, reject) {
      genTimeoutHandle = setTimeout(function () {
        reject(new Error("The AI is taking too long. Please check your connection and try again."));
      }, 30000);
    });

    try {
      var prefs = document.getElementById("meal-preferences").value.trim();
      var exclusions = profile.exclusions || [];
      var fullPrefs = prefs || "";
      if (exclusions.length > 0) {
        var excludeStr = "MUST NOT include these foods (allergies/dislikes): " + exclusions.join(", ");
        fullPrefs = fullPrefs ? fullPrefs + ". " + excludeStr : excludeStr;
      }

      console.log("[MacroCore AI] Invoking generate-meal-plan at", new Date().toISOString());
      var invokeResult = await Promise.race([
        supabase.functions.invoke("generate-meal-plan", {
          body: {
            calories: profile.calories,
            protein: profile.protein,
            carbs: profile.carbs,
            fats: profile.fats,
            preferences: fullPrefs || undefined,
          },
        }),
        genTimeoutPromise,
      ]);
      clearTimeout(genTimeoutHandle);

      var data = invokeResult.data;
      var error = invokeResult.error;
      console.log("[MacroCore AI] Response — error:", !!error, "has meals:", !!(data && data.meals));

      if (error) {
        var errMsg = error.message || "Request failed";
        var errStatus = error.context && error.context.status;
        // Try to extract structured error body from the response context.
        if (error.context) {
          try {
            var errBody = await error.context.json();
            if (errBody && errBody.error) errMsg = errBody.error;
          } catch (_) {}
        }
        // Map common AI-generation-specific status codes to readable copy.
        if (errStatus === 429 || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("too many")) {
          errMsg = "You've hit the AI rate limit. Please wait a moment, then try again.";
        } else if (errStatus === 503 || errMsg.toLowerCase().includes("service unavailable")) {
          errMsg = "The AI service is temporarily unavailable. Please try again in a minute.";
        } else if (errStatus === 401 || errStatus === 403) {
          errMsg = "AI access error. Please sign out and back in, then try again.";
        }
        throw new Error(errMsg);
      }

      // Guard: server returned 200 but body was null or not an object.
      if (!data || typeof data !== "object") {
        throw new Error("Received an unexpected response. Please try again.");
      }
      if (data.error) throw new Error(data.error);

      // Validate and normalise each meal before rendering.
      var rawMeals = Array.isArray(data.meals) ? data.meals : [];
      if (rawMeals.length === 0) {
        throw new Error("The AI returned an empty meal plan. Please try again with different preferences.");
      }
      mealPlanMeals = rawMeals
        .map(normaliseMeal)
        .filter(function (m) { return m !== null; })
        .sort(function (a, b) {
          return MEAL_PLAN_ORDER.indexOf(a.meal_type) - MEAL_PLAN_ORDER.indexOf(b.meal_type);
        });
      if (mealPlanMeals.length === 0) {
        throw new Error("The AI returned meals with missing data. Please try again.");
      }

      cacheMealPlan();
      saveMealPlanToSupabase(prefs);
    } catch (e) {
      clearTimeout(genTimeoutHandle);
      console.error("[MacroCore AI] Error:", e.message);
      var elErr = document.getElementById("meal-plan-output");
      if (elErr) {
        elErr.innerHTML =
          '<div class="card" style="text-align:center;padding:2rem">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--destructive))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 0.5rem"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>' +
          '<p style="font-size:0.875rem;color:hsl(var(--foreground));font-weight:500">Failed to generate meal plan</p>' +
          '<p style="font-size:0.75rem;color:hsl(var(--muted-foreground));margin-top:0.25rem">' + esc(e.message || "Please try again") + "</p>" +
          '<button class="btn btn-ghost" style="margin-top:1rem;font-size:0.8125rem" id="btn-retry-generate">Try Again</button>' +
          '</div>';
        var retryBtn = document.getElementById("btn-retry-generate");
        if (retryBtn) retryBtn.addEventListener("click", function () { haptic(); generateMealPlan(); });
      }
    } finally {
      mealPlanLoading = false;
      if (genBtn) { genBtn.disabled = false; genBtn.removeAttribute("aria-busy"); }
      if (mealPlanMeals.length > 0) renderMealPlanOutput();
    }
  }

  // Normalises a raw meal object from the AI response.
  // Returns null if the object is too malformed to display safely.
  // KEEP IN SYNC with src/lib/mealPlanUtils.ts (tested there).
  function normaliseMeal(raw) {
    if (!raw || typeof raw !== "object") return null;
    // meal_type and name are required — without them the card has no identity.
    if (typeof raw.name !== "string" || !raw.name.trim()) return null;
    return {
      meal_type:    typeof raw.meal_type === "string" ? raw.meal_type : "snack",
      name:         raw.name.trim(),
      calories:     Math.max(0, Number(raw.calories) || 0),
      protein:      Math.max(0, Number(raw.protein)  || 0),
      carbs:        Math.max(0, Number(raw.carbs)    || 0),
      fats:         Math.max(0, Number(raw.fats)     || 0),
      prep_time_min: Math.max(0, Number(raw.prep_time_min) || 0),
      ingredients:  Array.isArray(raw.ingredients)
        ? raw.ingredients.filter(function (i) { return i && typeof i.name === "string"; })
        : [],
    };
  }

  // ══════════════════════════════════════════════════════════
  // PROGRESS PAGE
  // ══════════════════════════════════════════════════════════

  function renderProgress() {
    var totalLost = 0;
    var streak = 0;
    var durationWeeks = 0;

    // Sort weight logs oldest-first for consistent calculations
    var sortedWeights = weightLogs.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    if (sortedWeights.length >= 2) {
      totalLost = sortedWeights[0].weight - sortedWeights[sortedWeights.length - 1].weight;
    }

    // Duration: from startedAt (or first weight log) to today
    var durationStart = profile.startedAt
      ? new Date(profile.startedAt)
      : (sortedWeights.length >= 1 ? new Date(sortedWeights[0].date + "T12:00:00") : null);
    if (durationStart) {
      durationWeeks = Math.max(1, Math.round((new Date() - durationStart) / (7 * 24 * 60 * 60 * 1000)));
    }

    // Streak: consecutive days with food logged going backwards.
    // If today has no food yet, skip it so a prior streak isn't broken.
    streak = 0;
    var streakDate = new Date();
    for (var si = 0; si < 366; si++) {
      var sDateStr = streakDate.toISOString().slice(0, 10);
      var sDayEntries = sDateStr === todayStr() ? foodEntries : (cacheGet("food_" + sDateStr) || []);
      if (sDayEntries.length > 0) {
        streak++;
        streakDate.setDate(streakDate.getDate() - 1);
      } else if (si === 0) {
        // Today not logged yet — start counting from yesterday
        streakDate.setDate(streakDate.getDate() - 1);
      } else {
        break;
      }
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

    // Weight trend chart — individual daily entries, up to last 14
    if (sortedWeights.length >= 1) {
      var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      var chartData = sortedWeights.slice(-14).map(function (w) {
        var d = new Date(w.date + "T12:00:00");
        return { day: MONTHS[d.getMonth()] + " " + d.getDate(), weight: w.weight };
      });
      drawLineChart(document.getElementById("weight-trend-chart"), chartData, "day", "weight", " lbs");
    } else {
      document.getElementById("weight-trend-chart").innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:hsl(var(--muted-foreground));font-size:0.875rem">Log your weight to see trends</div>';
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
      document.getElementById("weight-log-status").textContent = "Today's weight logged: " + todayLog.weight + " lbs";
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
    var results = [];
    var DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var dateStr = d.toISOString().slice(0, 10);
      var entries = i === 0 ? foodEntries : (cacheGet("food_" + dateStr) || []);
      if (entries.length === 0) continue;
      var totalCals = entries.reduce(function (sum, e) { return sum + (e.calories || 0); }, 0);
      var pct = Math.round((totalCals / profile.calories) * 100);
      var label = i === 0 ? "Today" : DAY_LABELS[d.getDay()];
      results.push({ day: label, pct: pct });
    }
    return results;
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
      (guestMode
        ? '<div style="background:hsl(var(--surface));border:1px solid hsl(var(--border));border-radius:1rem;padding:1rem;text-align:center;margin-top:0.5rem">' +
          '<p style="font-size:0.8125rem;color:hsl(var(--muted-foreground));margin-bottom:0.75rem">You\'re exploring as a guest. Create a free account to sync your data across devices.</p>' +
          '<button class="btn btn-primary" id="btn-create-account" style="width:100%;margin-bottom:0.5rem">Create Free Account</button>' +
          '<button class="btn btn-ghost" id="btn-guest-sign-out" style="width:100%;font-size:0.8125rem">Exit Guest Mode</button>' +
          '</div>'
        : '<button class="btn btn-ghost" id="btn-sign-out" style="width:100%">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg> Sign Out</button>' +
          '<button class="btn-destructive" id="btn-delete-account" style="width:100%">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg> Delete Account</button>') +
      '</div>';

    el.querySelectorAll(".settings-item").forEach(function (btn) {
      btn.addEventListener("click", function () { openSettingsPanel(btn.dataset.panel); });
    });

    document.getElementById("btn-reset-onboarding").addEventListener("click", function () {
      updateProfile({ onboarded: false });
      showOnboarding();
    });

    if (guestMode) {
      document.getElementById("btn-create-account").addEventListener("click", function () {
        handleGuestSignOut();
      });
      document.getElementById("btn-guest-sign-out").addEventListener("click", handleGuestSignOut);
    } else {
      document.getElementById("btn-sign-out").addEventListener("click", handleSignOut);
      document.getElementById("btn-delete-account").addEventListener("click", handleDeleteAccount);
    }
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

    var permStatus = "";
    if (!notifSupported()) {
      permStatus = '<div style="background:hsl(var(--muted));border-radius:0.75rem;padding:0.75rem 1rem;font-size:0.75rem;color:hsl(var(--muted-foreground));margin-bottom:0.75rem">Notifications are not supported in this browser.</div>';
    } else if (Notification.permission === "denied") {
      permStatus = '<div style="background:hsl(var(--destructive)/0.1);border:1px solid hsl(var(--destructive)/0.2);border-radius:0.75rem;padding:0.75rem 1rem;font-size:0.75rem;color:hsl(var(--destructive));margin-bottom:0.75rem">Notifications are blocked. Enable them in your browser/device settings to receive reminders.</div>';
    } else if (Notification.permission === "granted") {
      permStatus = '<div style="background:hsl(var(--success)/0.1);border:1px solid hsl(var(--success)/0.2);border-radius:0.75rem;padding:0.75rem 1rem;font-size:0.75rem;color:hsl(var(--success));margin-bottom:0.75rem">✓ Notifications are enabled.</div>';
    } else {
      permStatus = '<div style="background:hsl(var(--primary)/0.08);border:1px solid hsl(var(--primary)/0.2);border-radius:0.75rem;padding:0.75rem 1rem;font-size:0.75rem;color:hsl(var(--primary));margin-bottom:0.75rem" id="sp-notif-permission-note">Enable a reminder below to allow notifications.</div>';
    }

    return (
      '<h2 class="font-display" style="font-size:1.25rem;font-weight:700;color:hsl(var(--foreground))">Reminders</h2>' +
      permStatus +

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
    function applyPermissionGranted() {
      // Refresh the status note if it exists
      var note = document.getElementById("sp-notif-permission-note");
      if (note) {
        note.style.background = "hsl(var(--success)/0.1)";
        note.style.borderColor = "hsl(var(--success)/0.2)";
        note.style.color = "hsl(var(--success))";
        note.textContent = "✓ Notifications are enabled.";
      }
    }
    function applyPermissionDenied() {
      var note = document.getElementById("sp-notif-permission-note");
      if (note) {
        note.style.background = "hsl(var(--destructive)/0.1)";
        note.style.borderColor = "hsl(var(--destructive)/0.2)";
        note.style.color = "hsl(var(--destructive))";
        note.textContent = "Notifications are blocked. Enable them in your browser/device settings.";
      }
    }

    document.getElementById("sp-toggle-reminder").addEventListener("click", function () {
      var enabling = !profile.reminderEnabled;
      updateProfile({ reminderEnabled: enabling });
      document.getElementById("sp-toggle-reminder").classList.toggle("on", enabling);
      document.getElementById("sp-reminder-time").style.display = enabling ? "" : "none";
      if (enabling) requestNotifPermission(applyPermissionGranted, applyPermissionDenied);
    });
    document.getElementById("sp-rtime").addEventListener("input", function (e) {
      updateProfile({ reminderTime: e.target.value });
    });
    document.getElementById("sp-toggle-weighin").addEventListener("click", function () {
      var enabling = !profile.weighInReminderEnabled;
      updateProfile({ weighInReminderEnabled: enabling });
      document.getElementById("sp-toggle-weighin").classList.toggle("on", enabling);
      document.getElementById("sp-weighin-day").style.display = enabling ? "" : "none";
      if (enabling) requestNotifPermission(applyPermissionGranted, applyPermissionDenied);
    });
    document.getElementById("sp-weighin-select").addEventListener("change", function (e) {
      updateProfile({ weighInDay: e.target.value });
    });
  }

  // ══════════════════════════════════════════════════════════
  // NOTIFICATIONS / REMINDERS
  // ══════════════════════════════════════════════════════════

  function notifSupported() {
    return "Notification" in window;
  }

  function requestNotifPermission(onGranted, onDenied) {
    if (!notifSupported()) { onDenied && onDenied(); return; }
    if (Notification.permission === "granted") { onGranted && onGranted(); return; }
    if (Notification.permission === "denied")  { onDenied  && onDenied();  return; }
    Notification.requestPermission().then(function (perm) {
      perm === "granted" ? (onGranted && onGranted()) : (onDenied && onDenied());
    });
  }

  function fireNotif(title, body, tag) {
    if (!notifSupported() || Notification.permission !== "granted") return;
    try {
      var n = new Notification(title, {
        body: body,
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        tag: tag,
      });
      n.onclick = function () { window.focus(); n.close(); };
    } catch (_) {}
  }

  function checkAndFireReminders() {
    if (!notifSupported() || Notification.permission !== "granted") return;

    var now = new Date();
    var today = todayStr();
    var DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    var todayDayName = DAY_NAMES[now.getDay()];

    // ── Meal reminder ─────────────────────────────────────
    if (profile.reminderEnabled && cacheGet("mealReminderShownDate") !== today) {
      var parts = (profile.reminderTime || "12:00").split(":");
      var reminderMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      var nowMins = now.getHours() * 60 + now.getMinutes();
      if (nowMins >= reminderMins && foodEntries.length === 0) {
        fireNotif(
          "Time to log your meals 🍽️",
          "You haven't logged any food today. Stay on track with your " + profile.calories + " cal target.",
          "meal-reminder"
        );
        cacheSet("mealReminderShownDate", today);
      }
    }

    // ── Weigh-in reminder ─────────────────────────────────
    if (profile.weighInReminderEnabled && cacheGet("weighInReminderShownDate") !== today) {
      if (todayDayName === (profile.weighInDay || "monday")) {
        var alreadyLogged = weightLogs.some(function (w) { return w.date === today; });
        if (!alreadyLogged) {
          fireNotif(
            "Weigh-in day ⚖️",
            "It's your weekly weigh-in. Log your weight on the Progress page to keep your targets accurate.",
            "weighin-reminder"
          );
          cacheSet("weighInReminderShownDate", today);
        }
      }
    }
  }

  function initReminders() {
    if (!notifSupported()) return;
    checkAndFireReminders();
    setInterval(checkAndFireReminders, 60 * 1000);
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
      "</p></div>" +
      '<div class="card" style="border:1px solid hsl(var(--border));background:hsl(var(--surface))">' +
      '<p style="font-size:0.75rem;font-weight:600;color:hsl(var(--muted-foreground));text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem">Disclaimer</p>' +
      '<p style="font-size:0.75rem;color:hsl(var(--muted-foreground));line-height:1.6">' +
      "MacroCore is for educational and informational purposes only. It is not a medical device and does not provide medical advice. Calorie and macro targets are estimates based on general formulas and should not replace guidance from a registered dietitian, nutritionist, or healthcare provider. Consult a qualified professional before making significant changes to your diet." +
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
        loadRecentFoodEntriesFromSupabase(),
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
      checkWeeklyAutoAdjust();
      initReminders();
      initNetworkMonitoring();
      updateArchiveBadge();
      // Refresh entitlement from RevenueCat (fire-and-forget; cached value used first).
      PurchaseManager.refreshEntitlements();
      PurchaseManager.initListener();
      // Re-check on page visibility change (tab switch / app resume from browser).
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") PurchaseManager.refreshEntitlements();
      });
      handleRoute();
    } else {
      showOnboarding();
    }
  }

  // ══════════════════════════════════════════════════════════
  // EVENT BINDINGS
  // ══════════════════════════════════════════════════════════

  function init() {
    // iOS WKWebView: position:fixed overlays shrink when keyboard opens because
    // `bottom: 0` tracks the visual viewport. Lock overlays to the pre-keyboard
    // screen height via a CSS variable set once at load time.
    function setScreenHeight() {
      // Use visualViewport.height when available (correct on iPad floating keyboard,
      // Split View resize, and Stage Manager). Fall back to window.innerHeight.
      var h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
      document.documentElement.style.setProperty('--screen-height', h + 'px');
    }
    setScreenHeight();
    // visualViewport fires on every keyboard show/hide and Split View resize.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setScreenHeight);
    } else {
      window.addEventListener('orientationchange', function () {
        setTimeout(setScreenHeight, 300);
      });
    }

    // Scroll the focused auth / onboarding input above the keyboard on iPad.
    // On iOS the WKWebView scroll lock means the input can stay behind the
    // software keyboard; scrollIntoView() with a small delay fixes it.
    document.addEventListener('focusin', function (e) {
      var target = e.target;
      if (!target || !target.tagName) return;
      var tag = target.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') return;
      // Only act inside overlays that might be obscured by the keyboard.
      var inAuth = document.getElementById('auth-overlay') && document.getElementById('auth-overlay').contains(target);
      var inOnboarding = document.getElementById('onboarding') && document.getElementById('onboarding').contains(target);
      if (!inAuth && !inOnboarding) return;
      // Delay lets the keyboard animation start first.
      setTimeout(function () {
        try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      }, 350);
    });

    // Prevent iOS WKWebView from shifting window scroll when keyboard opens.
    // iOS adjusts UIScrollView contentOffset to bring the focused input above
    // the keyboard — this registers as window.scrollY changing. We lock it to 0
    // on every animation frame for the duration of the keyboard open animation.
    var _scrollLockRAF = null;

    function startScrollLock() {
      if (_scrollLockRAF) return;
      var deadline = Date.now() + 600; // cover keyboard animation (~300–500ms)
      function lock() {
        window.scrollTo(0, 0);
        _scrollLockRAF = Date.now() < deadline ? requestAnimationFrame(lock) : null;
      }
      _scrollLockRAF = requestAnimationFrame(lock);
    }

    function stopScrollLock() {
      if (_scrollLockRAF) { cancelAnimationFrame(_scrollLockRAF); _scrollLockRAF = null; }
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    }

    // Start locking as soon as any input inside a fixed overlay is focused,
    // before iOS has a chance to adjust the scroll position.
    document.addEventListener('focusin', function (e) {
      var el = e.target;
      while (el) {
        if (el.id === 'auth-overlay' || el.id === 'onboarding') {
          startScrollLock();
          return;
        }
        el = el.parentElement;
      }
    }, true);

    document.addEventListener('focusout', function () {
      stopScrollLock();
    }, true);

    // Theme
    setTheme(getTheme());

    // Auth events
    document.getElementById("auth-form").addEventListener("submit", handleAuthSubmit);
    document.getElementById("auth-toggle-btn").addEventListener("click", toggleAuthMode);
    document.getElementById("btn-guest").addEventListener("click", handleGuestLogin);

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
      btn.addEventListener("click", function () { haptic('Light'); navigate(btn.dataset.page); });
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
    document.getElementById("fab-log").addEventListener("click", function () { haptic(); openQuickLog(); });
    document.getElementById("btn-share-progress").addEventListener("click", shareProgress);
    document.getElementById("quicklog-overlay").addEventListener("click", closeQuickLog);
    document.getElementById("quicklog-close").addEventListener("click", closeQuickLog);
    document.getElementById("food-search").addEventListener("input", function (e) { renderFoodList(e.target.value); });

    // Serving size panel
    document.getElementById("serving-cancel").addEventListener("click", hideServingPanel);
    document.getElementById("serving-confirm").addEventListener("click", function () { haptic(); confirmServing(); });
    document.getElementById("serving-amount").addEventListener("input", updateServingMacros);
    document.getElementById("serving-unit").addEventListener("change", updateServingMacros);

    // Custom food entry
    document.getElementById("btn-lookup-macros").addEventListener("click", lookupFoodMacros);
    document.getElementById("btn-custom-food").addEventListener("click", function () { haptic(); addCustomFood(); });

    // Settings panel overlay close
    document.getElementById("settings-overlay").addEventListener("click", closeSettingsPanel);

    // Meal plan generate
    document.getElementById("btn-generate-meal").addEventListener("click", generateMealPlan);

    // Web paywall overlay (fallback when native bridge is unavailable)
    document.getElementById("btn-paywall-close").addEventListener("click", function () { closeWebPaywall(false); });
    document.getElementById("paywall-overlay").addEventListener("click", function (e) {
      if (e.target === document.getElementById("paywall-overlay")) closeWebPaywall(false);
    });
    document.getElementById("btn-paywall-restore").addEventListener("click", async function () {
      var btn = document.getElementById("btn-paywall-restore");
      btn.textContent = "Restoring...";
      btn.disabled = true;
      var res = await PurchaseManager.restorePurchases();
      btn.textContent = "Restore Purchases";
      btn.disabled = false;
      if (res.isPro) closeWebPaywall(true);
    });

    // Archive overlay
    document.getElementById("btn-open-archive").addEventListener("click", function () { haptic("Light"); openArchive(); });
    document.getElementById("btn-close-archive").addEventListener("click", closeArchive);
    document.getElementById("archive-overlay").addEventListener("click", function (e) {
      if (e.target === document.getElementById("archive-overlay")) closeArchive();
    });
    document.getElementById("archive-search").addEventListener("input", function (e) {
      archiveSearchQuery = e.target.value;
      renderArchiveList();
    });
    document.getElementById("btn-close-archive-detail").addEventListener("click", closeArchiveDetail);
    document.getElementById("archive-detail-overlay").addEventListener("click", function (e) {
      if (e.target === document.getElementById("archive-detail-overlay")) closeArchiveDetail();
    });
    document.getElementById("btn-archive-detail-delete").addEventListener("click", function () {
      if (!archiveDetailPlanId) return;
      if (!window.confirm("Delete this saved plan? This cannot be undone.")) return;
      deleteArchivedPlan(archiveDetailPlanId);
      closeArchiveDetail();
      renderArchiveList();
    });

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
    document.getElementById("btn-log-weight").addEventListener("click", function () { haptic(); handleWeightLog(); });
    document.getElementById("weight-log-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); handleWeightLog(); }
    });
  }

  // ── Service Worker Registration ─────────────────────────
  var isNative = window.Capacitor && window.Capacitor.isNative;
  if (!isNative && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(function (err) {
      console.warn("SW registration failed:", err);
    });
  }

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
