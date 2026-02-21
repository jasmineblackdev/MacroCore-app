// @ts-check
const { test, expect } = require('@playwright/test');

// ─── Supabase CDN mock (injected in place of the real CDN script) ────────────
const MOCK_SUPABASE_SCRIPT = `
(function () {
  var _cfg = window.__testConfig || {};
  var _authed = !!_cfg.authenticated;
  var _profile = _cfg.profile || null;
  var _entries = _cfg.foodEntries || [];
  var _weights = _cfg.weightLogs || [];
  var _authCbs = [];

  var _session = _authed
    ? { user: { id: 'test-uid-123', email: 'test@example.com' } }
    : null;

  // Returns a thenable query chain — all filters are no-ops, terminal methods resolve.
  function chain(rows) {
    var arr = Array.isArray(rows) ? rows : (rows ? [rows] : []);
    var c = {
      eq:    function () { return c; },
      neq:   function () { return c; },
      gte:   function () { return c; },
      lte:   function () { return c; },
      lt:    function () { return c; },
      gt:    function () { return c; },
      order: function () { return c; },
      limit: function () { return c; },
      // Promise terminal
      single: function () { return Promise.resolve({ data: arr[0] || null, error: null }); },
      then:   function (res, rej) { return Promise.resolve({ data: arr, error: null }).then(res, rej); },
      catch:  function (r)        { return Promise.resolve({ data: arr, error: null }).catch(r); },
    };
    return c;
  }

  window.supabase = {
    createClient: function () {
      return {
        auth: {
          onAuthStateChange: function (cb) {
            _authCbs.push(cb);
            // Fire asynchronously so the app finishes binding event listeners first
            setTimeout(function () {
              if (_authed) cb('SIGNED_IN', _session);
            }, 20);
            return { data: { subscription: { unsubscribe: function () {} } } };
          },

          getSession: function () {
            return Promise.resolve({ data: { session: _session }, error: null });
          },

          signInWithPassword: function (creds) {
            if (creds.email === 'test@example.com' && creds.password === 'password123') {
              return Promise.resolve({ data: { session: _session }, error: null });
            }
            return Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } });
          },

          signUp: function () {
            return Promise.resolve({ data: { user: { id: 'new-uid' }, session: null }, error: null });
          },

          signOut: function () {
            _authed = false;
            _session = null;
            _authCbs.forEach(function (cb) { cb('SIGNED_OUT', null); });
            return Promise.resolve({ error: null });
          },
        },

        from: function (table) {
          var rows = ({
            profiles:     _profile ? [_profile] : [],
            food_entries: _entries,
            weight_logs:  _weights,
            meal_plans:   [],
            adjustments:  [],
          })[table] || [];

          return {
            select:  function () { return chain(rows); },
            upsert:  function () { return Promise.resolve({ error: null }); },
            insert:  function () { return Promise.resolve({ data: rows, error: null }); },
            delete:  function () { return { eq: function () { return Promise.resolve({ error: null }); } }; },
          };
        },

        rpc: function () { return Promise.resolve({ data: null, error: null }); },
      };
    },
  };
})();
`;

// ─── Shared test profile (server-side columns) ───────────────────────────────
const ONBOARDED_PROFILE = {
  id:                       'test-uid-123',
  name:                     'Test User',
  age:                      28,
  sex:                      'male',
  height_ft:                5,
  height_in:                11,
  weight:                   175,
  activity_level:           'moderate',
  goal:                     'lose',
  rate:                     1,
  units:                    'imperial',
  reminder_enabled:         false,
  reminder_time:            '12:00',
  weigh_in_reminder_enabled: false,
  weigh_in_day:             'monday',
  onboarded:                true,
  started_at:               new Date().toISOString(),
  calories:                 2100,
  protein:                  160,
  carbs:                    210,
  fats:                     70,
  exclusions:               [],
};

// ─── Helper: configure mock and navigate ─────────────────────────────────────
async function setupPage(page, config = {}) {
  // Inject test config before ANY page scripts run
  await page.addInitScript((cfg) => { window.__testConfig = cfg; }, config);

  // Intercept the Supabase CDN and return our mock instead
  await page.route('**/supabase-js**', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: MOCK_SUPABASE_SCRIPT });
  });

  await page.goto('/');
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH SCREEN TESTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Auth Screen', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { authenticated: false });
  });

  test('shows auth overlay when unauthenticated', async ({ page }) => {
    const overlay = page.locator('#auth-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).not.toHaveClass(/hidden/);
  });

  test('displays correct sign-in title and subtitle', async ({ page }) => {
    await expect(page.locator('#auth-title')).toHaveText('Welcome to MacroCore');
    await expect(page.locator('#auth-subtitle')).toContainText('Sign in');
  });

  test('shows email and password fields', async ({ page }) => {
    await expect(page.locator('#auth-email')).toBeVisible();
    await expect(page.locator('#auth-password')).toBeVisible();
  });

  test('Sign In button is visible and enabled', async ({ page }) => {
    const btn = page.locator('#auth-submit');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText('Sign In');
  });

  test('toggling to Sign Up updates title and button', async ({ page }) => {
    await page.locator('#auth-toggle-btn').click();
    await expect(page.locator('#auth-title')).toHaveText('Create Account');
    await expect(page.locator('#auth-submit')).toHaveText('Sign Up');
    await expect(page.locator('#auth-toggle-btn')).toHaveText('Sign In');
  });

  test('toggling back to Sign In restores title', async ({ page }) => {
    await page.locator('#auth-toggle-btn').click(); // → Sign Up
    await page.locator('#auth-toggle-btn').click(); // → Sign In
    await expect(page.locator('#auth-title')).toHaveText('Welcome to MacroCore');
    await expect(page.locator('#auth-submit')).toHaveText('Sign In');
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.locator('#auth-email').fill('wrong@example.com');
    await page.locator('#auth-password').fill('badpassword');
    await page.locator('#auth-submit').click();
    const err = page.locator('#auth-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Invalid login credentials');
  });

  test('bottom nav is hidden on auth screen', async ({ page }) => {
    await expect(page.locator('#bottom-nav')).toBeHidden();
  });

  test('onboarding is hidden on auth screen', async ({ page }) => {
    // Onboarding display should be none when auth is shown
    await expect(page.locator('#onboarding')).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING FLOW TESTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticated but NOT onboarded — no profile returned from Supabase
    await setupPage(page, { authenticated: true, profile: null });
  });

  test('shows onboarding welcome screen after login', async ({ page }) => {
    const welcome = page.locator('#step-welcome');
    await expect(welcome).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.welcome-screen h1')).toHaveText('MacroCore');
  });

  test('Get Started button advances to basics step', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await expect(page.locator('#step-basics')).toBeVisible();
    await expect(page.locator('#step-welcome')).toBeHidden();
  });

  test('Continue button on basics is disabled when name is empty', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await expect(page.locator('#btn-basics-next')).toBeDisabled();
  });

  test('Continue button enables after entering name', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await expect(page.locator('#btn-basics-next')).toBeEnabled();
  });

  test('basics step shows name, age, and sex fields', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await expect(page.locator('#ob-name')).toBeVisible();
    await expect(page.locator('#ob-age')).toBeVisible();
    await expect(page.locator('.sex-selector')).toBeVisible();
  });

  test('sex selector toggles correctly', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    const female = page.locator('.sex-btn[data-sex="female"]');
    const male   = page.locator('.sex-btn[data-sex="male"]');
    await female.click();
    await expect(female).toHaveClass(/selected/);
    await expect(male).not.toHaveClass(/selected/);
  });

  test('advances from basics to body step', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    await expect(page.locator('#step-body')).toBeVisible();
    await expect(page.locator('#step-basics')).toBeHidden();
  });

  test('body step shows height and weight fields', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    await expect(page.locator('#ob-height-ft')).toBeVisible();
    await expect(page.locator('#ob-height-in')).toBeVisible();
    await expect(page.locator('#ob-weight')).toBeVisible();
  });

  test('advances from body to activity step', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    await page.locator('#btn-body-next').click();
    await expect(page.locator('#step-activity')).toBeVisible();
  });

  test('activity options are displayed', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    await page.locator('#btn-body-next').click();
    const opts = page.locator('#activity-options .selection-btn');
    await expect(opts).toHaveCount(5);
  });

  test('selecting an activity option highlights it', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    await page.locator('#btn-body-next').click();
    const sedentary = page.locator('.selection-btn[data-activity="sedentary"]');
    await sedentary.click();
    await expect(sedentary).toHaveClass(/selected/);
  });

  test('advances from activity to goal step', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    await page.locator('#btn-body-next').click();
    await page.locator('#btn-activity-next').click();
    await expect(page.locator('#step-goal')).toBeVisible();
  });

  test('goal step shows lose/maintain/gain options', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    await page.locator('#btn-body-next').click();
    await page.locator('#btn-activity-next').click();
    await expect(page.locator('.selection-btn[data-goal="lose"]')).toBeVisible();
    await expect(page.locator('.selection-btn[data-goal="maintain"]')).toBeVisible();
    await expect(page.locator('.selection-btn[data-goal="gain"]')).toBeVisible();
  });

  test('rate selector buttons are present on goal step', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    await page.locator('#btn-body-next').click();
    await page.locator('#btn-activity-next').click();
    const rates = page.locator('.rate-btn');
    await expect(rates).toHaveCount(4);
  });

  test('progress bar advances with each step', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    // After welcome → basics, progress bar should be shown
    await expect(page.locator('#onboarding-progress')).toBeVisible();
    const filled = page.locator('.progress-bar-segment.filled');
    await expect(filled).toHaveCount(1);
  });

  test('back button returns to previous step', async ({ page }) => {
    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Alex');
    await page.locator('#btn-basics-next').click();
    // On body step — go back
    await page.locator('#onboarding-back').click();
    await expect(page.locator('#step-basics')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HOME PAGE TESTS  (authenticated + onboarded)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { authenticated: true, profile: ONBOARDED_PROFILE });
    // Wait for the app to finish loading the home page
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });
  });

  test('bottom nav is visible', async ({ page }) => {
    await expect(page.locator('#bottom-nav')).toBeVisible();
  });

  test('all five nav tabs are present', async ({ page }) => {
    const tabs = page.locator('.nav-item');
    await expect(tabs).toHaveCount(5);
  });

  test('Today tab is active by default', async ({ page }) => {
    await expect(page.locator('.nav-item[data-page="home"]')).toHaveClass(/active/);
  });

  test('calorie ring is visible', async ({ page }) => {
    await expect(page.locator('.calorie-ring-wrap')).toBeVisible();
    await expect(page.locator('.calorie-ring-svg')).toBeVisible();
  });

  test('calorie ring shows target calories', async ({ page }) => {
    await expect(page.locator('#ring-target')).toContainText('2,100');
  });

  test('FAB log button is visible', async ({ page }) => {
    await expect(page.locator('#fab-log')).toBeVisible();
  });

  test('page header shows greeting text', async ({ page }) => {
    await expect(page.locator('#page-home .page-header h1')).toBeVisible();
    await expect(page.locator('#page-home .page-header h1')).toHaveText('Today\'s Target');
  });

  test('weekly progress card is rendered', async ({ page }) => {
    await expect(page.locator('#weekly-progress-card')).toBeVisible();
  });

  test('today meals section is rendered', async ({ page }) => {
    await expect(page.locator('#today-log')).toBeVisible();
  });

  test('shows empty state when no food logged today', async ({ page }) => {
    const empty = page.locator('.empty-log');
    await expect(empty).toBeVisible();
  });

  test('clicking calorie ring expands macro breakdown', async ({ page }) => {
    await page.locator('#calorie-ring-btn').click();
    await expect(page.locator('.macro-breakdown')).toHaveClass(/open/);
    await expect(page.locator('#macro-p-tar')).toBeVisible();
  });

  test('macro breakdown shows protein/carbs/fats targets', async ({ page }) => {
    await page.locator('#calorie-ring-btn').click();
    await expect(page.locator('#macro-p-tar')).toContainText('160');
    await expect(page.locator('#macro-c-tar')).toContainText('210');
    await expect(page.locator('#macro-f-tar')).toContainText('70');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION TESTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { authenticated: true, profile: ONBOARDED_PROFILE });
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });
  });

  test('navigates to Meals page', async ({ page }) => {
    await page.locator('.nav-item[data-page="meals"]').click();
    await expect(page.locator('#page-meals')).toHaveClass(/active/);
    await expect(page.locator('#page-meals h1')).toHaveText('AI Meal Planner');
  });

  test('navigates to Progress page', async ({ page }) => {
    await page.locator('.nav-item[data-page="progress"]').click();
    await expect(page.locator('#page-progress')).toHaveClass(/active/);
    await expect(page.locator('#page-progress h1')).toHaveText('Progress');
  });

  test('navigates to Goals page', async ({ page }) => {
    await page.locator('.nav-item[data-page="goals"]').click();
    await expect(page.locator('#page-goals')).toHaveClass(/active/);
    await expect(page.locator('#page-goals h1')).toHaveText('Goals');
  });

  test('navigates to Settings page', async ({ page }) => {
    await page.locator('.nav-item[data-page="settings"]').click();
    await expect(page.locator('#page-settings')).toHaveClass(/active/);
    await expect(page.locator('#page-settings h1')).toHaveText('Settings');
  });

  test('nav item becomes active on click', async ({ page }) => {
    await page.locator('.nav-item[data-page="progress"]').click();
    await expect(page.locator('.nav-item[data-page="progress"]')).toHaveClass(/active/);
    await expect(page.locator('.nav-item[data-page="home"]')).not.toHaveClass(/active/);
  });

  test('only one nav item is active at a time', async ({ page }) => {
    await page.locator('.nav-item[data-page="goals"]').click();
    const active = page.locator('.nav-item.active');
    await expect(active).toHaveCount(1);
  });

  test('navigating back to Today page works', async ({ page }) => {
    await page.locator('.nav-item[data-page="meals"]').click();
    await page.locator('.nav-item[data-page="home"]').click();
    await expect(page.locator('#page-home')).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QUICK LOG SHEET TESTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Quick Log Sheet', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { authenticated: true, profile: ONBOARDED_PROFILE });
    await page.waitForSelector('#fab-log', { state: 'visible', timeout: 8000 });
  });

  test('quick log sheet is hidden initially', async ({ page }) => {
    await expect(page.locator('#quicklog-sheet')).not.toHaveClass(/open/);
  });

  test('FAB opens quick log sheet', async ({ page }) => {
    await page.locator('#fab-log').click();
    await expect(page.locator('#quicklog-sheet')).toHaveClass(/open/, { timeout: 3000 });
  });

  test('overlay appears when sheet opens', async ({ page }) => {
    await page.locator('#fab-log').click();
    await expect(page.locator('#quicklog-overlay')).toHaveClass(/open/, { timeout: 3000 });
  });

  test('close button dismisses quick log sheet', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await page.locator('#quicklog-close').click();
    await expect(page.locator('#quicklog-sheet')).not.toHaveClass(/open/, { timeout: 3000 });
  });

  test('clicking overlay dismisses sheet', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await page.locator('#quicklog-overlay').click();
    await expect(page.locator('#quicklog-sheet')).not.toHaveClass(/open/, { timeout: 3000 });
  });

  test('sheet shows Log Food header', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await expect(page.locator('.sheet-header h3')).toHaveText('Log Food');
  });

  test('meal type chips are present', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    const chips = page.locator('#meal-chips .chip');
    await expect(chips).toHaveCount(4); // breakfast, lunch, dinner, snack
  });

  test('food search input is visible', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await expect(page.locator('#food-search')).toBeVisible();
  });

  test('quick foods list is populated', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    const items = page.locator('#food-list .quick-food-item');
    await expect(items).toHaveCount(16); // 16 quick foods defined
  });

  test('searching filters the food list', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await page.locator('#food-search').fill('chicken');
    const visible = page.locator('#food-list .quick-food-item:visible');
    await expect(visible).toHaveCount(1);
  });

  test('clearing search restores full food list', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await page.locator('#food-search').fill('chicken');
    await page.locator('#food-search').fill('');
    const items = page.locator('#food-list .quick-food-item');
    await expect(items).toHaveCount(16);
  });

  test('custom entry form is visible', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await expect(page.locator('#custom-food-name')).toBeVisible();
    await expect(page.locator('#custom-food-cal')).toBeVisible();
    await expect(page.locator('#custom-food-protein')).toBeVisible();
    await expect(page.locator('#custom-food-carbs')).toBeVisible();
    await expect(page.locator('#custom-food-fats')).toBeVisible();
  });

  test('clicking a food item shows the serving panel', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await page.locator('#food-list .quick-food-item').first().click();
    await expect(page.locator('#serving-panel')).toBeVisible({ timeout: 3000 });
  });

  test('serving panel has amount input and confirm button', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await page.locator('#food-list .quick-food-item').first().click();
    await expect(page.locator('#serving-amount')).toBeVisible();
    await expect(page.locator('#serving-confirm')).toBeVisible();
    await expect(page.locator('#serving-cancel')).toBeVisible();
  });

  test('cancel button in serving panel hides the panel', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    await page.locator('#food-list .quick-food-item').first().click();
    await page.waitForSelector('#serving-panel', { state: 'visible' });
    await page.locator('#serving-cancel').click();
    await expect(page.locator('#serving-panel')).toBeHidden({ timeout: 3000 });
  });

  test('switching meal chip updates selection', async ({ page }) => {
    await page.locator('#fab-log').click();
    await page.waitForSelector('#quicklog-sheet.open');
    const breakfastChip = page.locator('#meal-chips .chip').first();
    await breakfastChip.click();
    await expect(breakfastChip).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEALS PAGE TESTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Meals Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { authenticated: true, profile: ONBOARDED_PROFILE });
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });
    await page.locator('.nav-item[data-page="meals"]').click();
    await expect(page.locator('#page-meals')).toHaveClass(/active/);
  });

  test('dietary preferences input is present', async ({ page }) => {
    await expect(page.locator('#meal-preferences')).toBeVisible();
  });

  test('allergies & dislikes section is present', async ({ page }) => {
    await expect(page.locator('#exclusion-input')).toBeVisible();
    await expect(page.locator('#btn-add-exclusion')).toBeVisible();
  });

  test('generate meal plan button is present', async ({ page }) => {
    await expect(page.locator('#btn-generate-meal')).toBeVisible();
  });

  test('can add an exclusion tag', async ({ page }) => {
    await page.locator('#exclusion-input').fill('peanuts');
    await page.locator('#btn-add-exclusion').click();
    const tag = page.locator('.exclusion-tag').first();
    await expect(tag).toBeVisible();
    await expect(tag).toContainText('peanuts');
  });

  test('exclusion tag can be removed', async ({ page }) => {
    await page.locator('#exclusion-input').fill('shellfish');
    await page.locator('#btn-add-exclusion').click();
    await page.waitForSelector('.exclusion-tag');
    await page.locator('.exclusion-tag button').first().click();
    await expect(page.locator('.exclusion-tag')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS PAGE TESTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Progress Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { authenticated: true, profile: ONBOARDED_PROFILE });
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });
    await page.locator('.nav-item[data-page="progress"]').click();
    await expect(page.locator('#page-progress')).toHaveClass(/active/);
  });

  test('shows stats grid', async ({ page }) => {
    await expect(page.locator('#progress-stats')).toBeVisible();
  });

  test('shows weight log card', async ({ page }) => {
    await expect(page.locator('#weight-log-card')).toBeVisible();
  });

  test('weight input and log button are present', async ({ page }) => {
    await expect(page.locator('#weight-log-input')).toBeVisible();
    await expect(page.locator('#btn-log-weight')).toBeVisible();
  });

  test('weight trend chart card is shown', async ({ page }) => {
    await expect(page.locator('#weight-trend-card')).toBeVisible();
  });

  test('adherence chart card is shown', async ({ page }) => {
    await expect(page.locator('#adherence-card')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GOALS PAGE TESTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Goals Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { authenticated: true, profile: ONBOARDED_PROFILE });
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });
    await page.locator('.nav-item[data-page="goals"]').click();
    await expect(page.locator('#page-goals')).toHaveClass(/active/);
  });

  test('displays current calorie target', async ({ page }) => {
    await expect(page.locator('#goals-calories')).toContainText('2100');
  });

  test('displays macro targets', async ({ page }) => {
    await expect(page.locator('#goals-protein')).toContainText('160');
    await expect(page.locator('#goals-carbs')).toContainText('210');
    await expect(page.locator('#goals-fats')).toContainText('70');
  });

  test('how adjustments work section is visible', async ({ page }) => {
    const steps = page.locator('.how-it-works-step');
    await expect(steps).toHaveCount(3);
  });

  test('adjustment history card is present', async ({ page }) => {
    await expect(page.locator('#adjustment-history')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PAGE TESTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page, { authenticated: true, profile: ONBOARDED_PROFILE });
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });
    await page.locator('.nav-item[data-page="settings"]').click();
    await expect(page.locator('#page-settings')).toHaveClass(/active/);
  });

  test('settings items are rendered', async ({ page }) => {
    const items = page.locator('.settings-item');
    await expect(items.first()).toBeVisible();
  });

  test('settings list has content', async ({ page }) => {
    await expect(page.locator('#settings-list')).not.toBeEmpty();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GUEST MODE TESTS
// ─────────────────────────────────────────────────────────────────────────────

// Profile shape that matches cacheSet('profile', ...) format used by app.js
const GUEST_PROFILE_ONBOARDED = {
  name: 'Guest',
  age: 30,
  sex: 'male',
  heightFt: 5,
  heightIn: 10,
  weight: 180,
  activityLevel: 'moderate',
  goal: 'maintain',
  rate: 0,
  units: 'imperial',
  onboarded: true,
  startedAt: new Date().toISOString(),
  calories: 2400,
  protein: 180,
  carbs: 270,
  fats: 80,
  reminderEnabled: false,
  reminderTime: '08:00',
  weighInReminderEnabled: false,
  weighInDay: 'monday',
  exclusions: [],
};

/**
 * Configures the page as an unauthenticated visitor.
 * seedProfile: true pre-seeds a cached onboarded profile via localStorage
 * so the guest skips onboarding and lands directly on the main app.
 */
async function setupGuestApp(page, { seedProfile = false } = {}) {
  await page.addInitScript((opts) => {
    window.__testConfig = { authenticated: false };
    if (opts.profile) {
      localStorage.setItem('mc_profile', JSON.stringify({ data: opts.profile, ts: Date.now() }));
    }
  }, { profile: seedProfile ? GUEST_PROFILE_ONBOARDED : null });

  await page.route('**/supabase-js**', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: MOCK_SUPABASE_SCRIPT });
  });

  await page.goto('/');
}

test.describe('Guest Mode', () => {
  test('Continue as Guest button is visible on auth screen', async ({ page }) => {
    await setupPage(page, { authenticated: false });
    await expect(page.locator('#btn-guest')).toBeVisible();
    await expect(page.locator('#btn-guest')).toHaveText('Continue as Guest');
  });

  test('auth modal shows "or" divider and local-only disclaimer', async ({ page }) => {
    await setupPage(page, { authenticated: false });
    await expect(page.locator('.auth-modal')).toContainText('or');
    await expect(page.locator('.auth-modal')).toContainText('data stays on this device');
  });

  test('clicking Continue as Guest hides the auth overlay', async ({ page }) => {
    await setupGuestApp(page);
    await page.locator('#btn-guest').click();
    await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 5000 });
  });

  test('guest mode shows onboarding welcome when no cached data', async ({ page }) => {
    await setupGuestApp(page);
    await page.locator('#btn-guest').click();
    await expect(page.locator('#step-welcome')).toBeVisible({ timeout: 5000 });
  });

  test('guest can complete full onboarding and reach home page', async ({ page }) => {
    await setupGuestApp(page);
    await page.locator('#btn-guest').click();
    await page.waitForSelector('#step-welcome', { state: 'visible' });

    await page.locator('#btn-get-started').click();
    await page.locator('#ob-name').fill('Demo User');
    await page.locator('#btn-basics-next').click();
    await page.locator('#btn-body-next').click();
    await page.locator('#btn-activity-next').click();
    await page.locator('#btn-goal-next').click();
    await page.locator('#btn-start-tracking').click();

    await expect(page.locator('#bottom-nav')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#page-home')).toHaveClass(/active/);
  });

  test('guest home page shows calorie ring and food log', async ({ page }) => {
    await setupGuestApp(page, { seedProfile: true });
    await page.locator('#btn-guest').click();
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });

    await expect(page.locator('.calorie-ring-wrap')).toBeVisible();
    await expect(page.locator('#today-log')).toBeVisible();
  });

  test('guest settings page shows Create Free Account button', async ({ page }) => {
    await setupGuestApp(page, { seedProfile: true });
    await page.locator('#btn-guest').click();
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });

    await page.locator('.nav-item[data-page="settings"]').click();
    await expect(page.locator('#btn-create-account')).toBeVisible();
    await expect(page.locator('#btn-create-account')).toHaveText('Create Free Account');
  });

  test('guest settings page shows Exit Guest Mode button', async ({ page }) => {
    await setupGuestApp(page, { seedProfile: true });
    await page.locator('#btn-guest').click();
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });

    await page.locator('.nav-item[data-page="settings"]').click();
    await expect(page.locator('#btn-guest-sign-out')).toBeVisible();
    await expect(page.locator('#btn-guest-sign-out')).toHaveText('Exit Guest Mode');
  });

  test('guest settings does not show Sign Out button', async ({ page }) => {
    await setupGuestApp(page, { seedProfile: true });
    await page.locator('#btn-guest').click();
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });

    await page.locator('.nav-item[data-page="settings"]').click();
    await expect(page.locator('#btn-sign-out')).toHaveCount(0);
  });

  test('guest settings does not show Delete Account button', async ({ page }) => {
    await setupGuestApp(page, { seedProfile: true });
    await page.locator('#btn-guest').click();
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });

    await page.locator('.nav-item[data-page="settings"]').click();
    await expect(page.locator('#btn-delete-account')).toHaveCount(0);
  });

  test('Exit Guest Mode returns to auth screen', async ({ page }) => {
    await setupGuestApp(page, { seedProfile: true });
    await page.locator('#btn-guest').click();
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });

    await page.locator('.nav-item[data-page="settings"]').click();
    await page.locator('#btn-guest-sign-out').click();

    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#bottom-nav')).toBeHidden();
  });

  test('Create Free Account button returns to auth screen', async ({ page }) => {
    await setupGuestApp(page, { seedProfile: true });
    await page.locator('#btn-guest').click();
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 8000 });

    await page.locator('.nav-item[data-page="settings"]').click();
    await page.locator('#btn-create-account').click();

    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#bottom-nav')).toBeHidden();
  });
});
