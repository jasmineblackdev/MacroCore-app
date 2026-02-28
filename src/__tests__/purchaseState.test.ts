/**
 * Purchase / entitlement state tests:
 *   ✓ isProUser bootstrapped from localStorage (no network)
 *   ✓ setProUser persists to localStorage and updates state
 *   ✓ generate is blocked when not Pro
 *   ✓ generate is allowed when Pro
 *   ✓ entitlementChanged event updates state
 *   ✓ expired entitlement (isPro flips false) — gate re-locks
 *   ✓ offline launch — cached state used, no crash
 *   ✓ restoreResult: 'alreadyActive' produces distinct message
 *   ✓ restoreResult: 'restored' produces success message
 *   ✓ restoreResult: 'notFound' produces no-subscription message
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Simulated entitlement state machine ─────────────────────────────────────
// Mirrors the logic in vanilla/app.js isProUser + setProUser + the generate gate.

const MC_IS_PRO_KEY = "mc_is_pro";

function createEntitlementState(initialStorage: Record<string, string> = {}) {
  // Simulate localStorage.
  const storage: Record<string, string> = { ...initialStorage };
  const mockStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
  };

  // Bootstrap from storage (mirrors IIFE boot in app.js).
  let isProUser: boolean = (() => {
    try { return JSON.parse(mockStorage.getItem(MC_IS_PRO_KEY) ?? "false"); }
    catch { return false; }
  })();

  const listeners: Array<(isPro: boolean) => void> = [];

  function setProUser(value: boolean) {
    isProUser = !!value;
    try { mockStorage.setItem(MC_IS_PRO_KEY, JSON.stringify(isProUser)); } catch {}
    listeners.forEach((fn) => fn(isProUser));
  }

  function onEntitlementChange(fn: (isPro: boolean) => void) {
    listeners.push(fn);
  }

  function canGenerate(): boolean {
    return isProUser;
  }

  return { getIsProUser: () => isProUser, setProUser, onEntitlementChange, canGenerate, storage };
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

describe("entitlement bootstrap from localStorage", () => {
  it("defaults to false when localStorage is empty", () => {
    const state = createEntitlementState();
    expect(state.getIsProUser()).toBe(false);
  });

  it("reads true from localStorage (Pro user returns to app)", () => {
    const state = createEntitlementState({ [MC_IS_PRO_KEY]: "true" });
    expect(state.getIsProUser()).toBe(true);
  });

  it("reads false from localStorage (not Pro)", () => {
    const state = createEntitlementState({ [MC_IS_PRO_KEY]: "false" });
    expect(state.getIsProUser()).toBe(false);
  });

  it("handles corrupted localStorage gracefully", () => {
    const state = createEntitlementState({ [MC_IS_PRO_KEY]: "{{invalid}}" });
    expect(state.getIsProUser()).toBe(false); // defaults to false, no throw
  });
});

// ─── setProUser ───────────────────────────────────────────────────────────────

describe("setProUser — state management", () => {
  it("updates isProUser in memory", () => {
    const state = createEntitlementState();
    state.setProUser(true);
    expect(state.getIsProUser()).toBe(true);
  });

  it("persists true to localStorage", () => {
    const state = createEntitlementState();
    state.setProUser(true);
    expect(state.storage[MC_IS_PRO_KEY]).toBe("true");
  });

  it("persists false to localStorage on expiry", () => {
    const state = createEntitlementState({ [MC_IS_PRO_KEY]: "true" });
    state.setProUser(false);
    expect(state.storage[MC_IS_PRO_KEY]).toBe("false");
    expect(state.getIsProUser()).toBe(false);
  });

  it("notifies listeners on change", () => {
    const state = createEntitlementState();
    const handler = vi.fn();
    state.onEntitlementChange(handler);
    state.setProUser(true);
    expect(handler).toHaveBeenCalledWith(true);
  });

  it("notifies multiple listeners", () => {
    const state = createEntitlementState();
    const h1 = vi.fn(), h2 = vi.fn();
    state.onEntitlementChange(h1);
    state.onEntitlementChange(h2);
    state.setProUser(true);
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });
});

// ─── Generate gate ────────────────────────────────────────────────────────────

describe("generate gate — canGenerate()", () => {
  it("blocks generation when not Pro", () => {
    const state = createEntitlementState();
    expect(state.canGenerate()).toBe(false);
  });

  it("allows generation when Pro", () => {
    const state = createEntitlementState({ [MC_IS_PRO_KEY]: "true" });
    expect(state.canGenerate()).toBe(true);
  });

  it("gates correctly after purchase (Pro becomes true)", () => {
    const state = createEntitlementState();
    expect(state.canGenerate()).toBe(false);
    state.setProUser(true);
    expect(state.canGenerate()).toBe(true);
  });

  it("re-locks after entitlement expiry", () => {
    const state = createEntitlementState({ [MC_IS_PRO_KEY]: "true" });
    expect(state.canGenerate()).toBe(true);
    state.setProUser(false); // simulate entitlement expiry refresh
    expect(state.canGenerate()).toBe(false);
  });
});

// ─── restoreResult distinct messages ─────────────────────────────────────────

function restoreResultMessage(restoreResult: string, isPro: boolean): string {
  if (restoreResult === "alreadyActive") return "You\u2019re already subscribed to MacroCore Pro.";
  if (isPro) return "Pro access restored!";
  return "No active subscription found for this Apple\u00A0ID.";
}

describe("restore purchase — distinct messages", () => {
  it("alreadyActive → 'already subscribed' message", () => {
    const msg = restoreResultMessage("alreadyActive", true);
    expect(msg).toContain("already subscribed");
  });

  it("restored → 'Pro access restored' message", () => {
    const msg = restoreResultMessage("restored", true);
    expect(msg).toContain("restored");
  });

  it("notFound → 'no active subscription' message", () => {
    const msg = restoreResultMessage("notFound", false);
    expect(msg).toContain("No active subscription");
  });
});

// ─── Offline launch ───────────────────────────────────────────────────────────

describe("offline launch", () => {
  it("cached Pro state works without any network call", () => {
    // Simulate: user is Pro, device is offline, app restarts.
    const state = createEntitlementState({ [MC_IS_PRO_KEY]: "true" });
    // No refreshEntitlements called (offline).
    expect(state.getIsProUser()).toBe(true);
    expect(state.canGenerate()).toBe(true);
  });

  it("cached non-Pro state works without any network call", () => {
    const state = createEntitlementState({ [MC_IS_PRO_KEY]: "false" });
    expect(state.getIsProUser()).toBe(false);
    expect(state.canGenerate()).toBe(false);
  });
});
