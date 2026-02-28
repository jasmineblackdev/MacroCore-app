/**
 * Archive CRUD edge-case tests:
 *   ✓ archive saves a plan to storage
 *   ✓ duplicate plan not saved twice (fingerprint check)
 *   ✓ save fails on quota — returns 'quota_full'
 *   ✓ quota trimming — evicts 5 oldest, retries
 *   ✓ delete removes the correct plan
 *   ✓ delete of non-existent id is safe (no throw)
 *   ✓ list capped at 50 plans
 *   ✓ search by title
 *   ✓ search by tag
 *   ✓ search by preferences
 *   ✓ search no results — empty array (not error)
 *   ✓ tag filter
 *   ✓ tag filter with no match — empty array
 *   ✓ empty storage returns empty array
 *   ✓ corrupted storage returns empty array (no throw)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  archivePlan,
  deleteArchivedPlan,
  getArchivedPlans,
  searchArchivedPlans,
  StorageAdapter,
  ArchiveInput,
} from "../lib/archiveUtils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdapter(failAfter = Infinity): StorageAdapter {
  const store: Record<string, string> = {};
  let writeCount = 0;
  return {
    get: (key) => store[key] ?? null,
    set: (key, value) => {
      writeCount++;
      if (writeCount > failAfter) return false;
      store[key] = value;
      return true;
    },
    remove: (key) => { delete store[key]; },
  };
}

function makePlan(overrides: Partial<ArchiveInput> = {}): ArchiveInput {
  return {
    id:          overrides.id          ?? "plan-" + Math.random().toString(36).slice(2),
    title:       overrides.title       ?? "Cut Plan — Feb 27",
    createdAt:   overrides.createdAt   ?? new Date().toISOString(),
    tags:        overrides.tags        ?? ["Cut", "High-Protein"],
    preferences: overrides.preferences ?? "high protein",
    meals:       overrides.meals       ?? [{ name: "Scrambled Eggs" }, { name: "Chicken Bowl" }],
    macros:      overrides.macros      ?? { calories: 2000, protein: 150, carbs: 200, fats: 65 },
  };
}

// ─── Archive / Persist ────────────────────────────────────────────────────────

describe("archivePlan — happy path", () => {
  it("saves a plan and retrieves it", () => {
    const adapter = makeAdapter();
    const plan = makePlan({ id: "p1", title: "My Plan" });
    const result = archivePlan(adapter, plan);
    expect(result).toBe("ok");
    const plans = getArchivedPlans(adapter);
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("My Plan");
  });

  it("stores newest plan first", () => {
    const adapter = makeAdapter();
    archivePlan(adapter, makePlan({ id: "old", title: "Old Plan", createdAt: "2025-01-01T00:00:00Z" }));
    archivePlan(adapter, makePlan({ id: "new", title: "New Plan", meals: [{ name: "Oatmeal" }] }));
    const plans = getArchivedPlans(adapter);
    expect(plans[0].title).toBe("New Plan");
    expect(plans[1].title).toBe("Old Plan");
  });

  it("caps list at 50 plans", () => {
    const adapter = makeAdapter();
    for (let i = 0; i < 55; i++) {
      archivePlan(adapter, makePlan({ id: `p${i}`, meals: [{ name: `Meal ${i}` }] }));
    }
    const plans = getArchivedPlans(adapter);
    expect(plans.length).toBeLessThanOrEqual(50);
  });
});

describe("archivePlan — duplicate prevention", () => {
  it("does not save the same plan twice (same meal names)", () => {
    const adapter = makeAdapter();
    const plan = makePlan({ id: "p1" });
    archivePlan(adapter, plan);
    archivePlan(adapter, { ...plan, id: "p2" }); // same meals, different id
    const plans = getArchivedPlans(adapter);
    expect(plans).toHaveLength(1);
  });

  it("saves plans with different meal compositions", () => {
    const adapter = makeAdapter();
    archivePlan(adapter, makePlan({ id: "p1", meals: [{ name: "Eggs" }] }));
    archivePlan(adapter, makePlan({ id: "p2", meals: [{ name: "Oatmeal" }] }));
    expect(getArchivedPlans(adapter)).toHaveLength(2);
  });
});

describe("archivePlan — storage quota errors", () => {
  it("returns 'quota_full' when storage always fails", () => {
    const adapter = makeAdapter(0); // fail immediately
    const result = archivePlan(adapter, makePlan());
    expect(result).toBe("quota_full");
  });

  it("returns 'quota_trimmed' when storage fails first then succeeds", () => {
    // Fails on first write (full list), succeeds on second (trimmed list).
    let callCount = 0;
    const store: Record<string, string> = {};
    const adapter: StorageAdapter = {
      get: (key) => store[key] ?? null,
      set: (key, value) => {
        callCount++;
        if (callCount === 1) return false; // first write fails
        store[key] = value;
        return true;
      },
      remove: (key) => { delete store[key]; },
    };
    // Pre-populate with some plans so trim has something to remove.
    store["mc_archived_plans"] = JSON.stringify(
      Array.from({ length: 20 }, (_, i) => makePlan({ id: `existing-${i}`, meals: [{ name: `Meal ${i}` }] }))
    );
    const result = archivePlan(adapter, makePlan({ id: "new-plan", meals: [{ name: "New Meal" }] }));
    expect(result).toBe("quota_trimmed");
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

describe("deleteArchivedPlan", () => {
  it("removes the plan with the matching id", () => {
    const adapter = makeAdapter();
    archivePlan(adapter, makePlan({ id: "keep", meals: [{ name: "Egg" }] }));
    archivePlan(adapter, makePlan({ id: "delete-me", meals: [{ name: "Rice" }] }));
    deleteArchivedPlan(adapter, "delete-me");
    const plans = getArchivedPlans(adapter);
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe("keep");
  });

  it("is safe when plan id does not exist", () => {
    const adapter = makeAdapter();
    archivePlan(adapter, makePlan({ id: "p1" }));
    expect(() => deleteArchivedPlan(adapter, "does-not-exist")).not.toThrow();
    expect(getArchivedPlans(adapter)).toHaveLength(1);
  });
});

// ─── Search ───────────────────────────────────────────────────────────────────

describe("searchArchivedPlans — title search", () => {
  const plans = [
    makePlan({ title: "Cut Plan — Feb 27", tags: ["Cut"] }),
    makePlan({ title: "Bulk Plan — Mar 1",  tags: ["Bulk"] }),
    makePlan({ title: "Maintain — Apr 5",   tags: ["Maintain"] }),
  ];

  it("matches by title (case-insensitive)", () => {
    const result = searchArchivedPlans(plans, "cut", null);
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Cut");
  });

  it("returns all plans for empty query", () => {
    expect(searchArchivedPlans(plans, "", null)).toHaveLength(3);
  });

  it("returns empty array for no-match query", () => {
    expect(searchArchivedPlans(plans, "keto", null)).toHaveLength(0);
  });

  it("matches by preferences", () => {
    const withPrefs = [makePlan({ preferences: "vegetarian high protein" })];
    expect(searchArchivedPlans(withPrefs, "vegetarian", null)).toHaveLength(1);
  });

  it("matches by tag (via search query)", () => {
    const result = searchArchivedPlans(plans, "bulk", null);
    expect(result).toHaveLength(1);
  });
});

describe("searchArchivedPlans — tag filter", () => {
  // Use distinct preferences so the "High" search only matches via tags, not preferences.
  const plans = [
    makePlan({ tags: ["Cut", "High-Protein"], preferences: "high protein, no dairy" }),
    makePlan({ tags: ["Bulk"],                preferences: "lean bulk"              }),
    makePlan({ tags: ["Cut"],                 preferences: "standard cut"           }),
  ];

  it("filters by active tag", () => {
    const result = searchArchivedPlans(plans, "", "Cut");
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no plan has the tag", () => {
    expect(searchArchivedPlans(plans, "", "Vegan")).toHaveLength(0);
  });

  it("combines search query and tag filter", () => {
    const result = searchArchivedPlans(plans, "High", "Cut");
    expect(result).toHaveLength(1);
  });

  it("null tag returns all plans", () => {
    expect(searchArchivedPlans(plans, "", null)).toHaveLength(3);
  });
});

// ─── Corrupt storage ──────────────────────────────────────────────────────────

describe("getArchivedPlans — corrupt storage", () => {
  it("returns empty array when storage contains invalid JSON", () => {
    const adapter: StorageAdapter = {
      get: () => "{{not valid json{{",
      set: () => true,
      remove: () => {},
    };
    expect(getArchivedPlans(adapter)).toEqual([]);
  });

  it("returns empty array when storage is empty", () => {
    const adapter = makeAdapter();
    expect(getArchivedPlans(adapter)).toEqual([]);
  });
});
