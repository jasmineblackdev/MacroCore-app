/**
 * archiveUtils.ts — archive CRUD operations over a storage adapter.
 * Decoupled from localStorage so it's fully testable without a DOM.
 * Mirrored as archiveCurrentPlan / getArchivedPlans / deleteArchivedPlan in vanilla/app.js.
 */

export interface ArchivedMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface ArchivedPlan {
  id: string;
  title: string;
  createdAt: string;
  tags: string[];
  preferences: string;
  meals: unknown[];
  macros: ArchivedMacros;
}

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): boolean; // returns false on quota error
  remove(key: string): void;
}

const STORAGE_KEY = "mc_archived_plans";
const MAX_PLANS   = 50;

function load(storage: StorageAdapter): ArchivedPlan[] {
  try {
    const raw = storage.get(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ArchivedPlan[];
  } catch {
    return [];
  }
}

export type SaveResult = "ok" | "quota_trimmed" | "quota_full";

function persist(storage: StorageAdapter, plans: ArchivedPlan[]): SaveResult {
  const ok = storage.set(STORAGE_KEY, JSON.stringify(plans));
  if (ok) return "ok";
  // First eviction attempt: remove 5 oldest entries.
  const trimmed = plans.slice(0, Math.max(1, plans.length - 5));
  const ok2 = storage.set(STORAGE_KEY, JSON.stringify(trimmed));
  return ok2 ? "quota_trimmed" : "quota_full";
}

export function getArchivedPlans(storage: StorageAdapter): ArchivedPlan[] {
  return load(storage);
}

export interface ArchiveInput {
  id: string;
  title: string;
  createdAt: string;
  tags: string[];
  preferences: string;
  meals: unknown[];
  macros: ArchivedMacros;
}

export function archivePlan(
  storage: StorageAdapter,
  plan: ArchiveInput
): SaveResult {
  const plans = load(storage);
  const fingerprint = (plan.meals as Array<{ name?: string }>)
    .map((m) => m?.name ?? "")
    .sort()
    .join("|");
  const alreadySaved = plans.some((p) => {
    const fp = (p.meals as Array<{ name?: string }>)
      .map((m) => m?.name ?? "")
      .sort()
      .join("|");
    return fp === fingerprint;
  });
  if (alreadySaved) return "ok";

  const updated = [plan, ...plans].slice(0, MAX_PLANS);
  return persist(storage, updated);
}

export function deleteArchivedPlan(
  storage: StorageAdapter,
  id: string
): void {
  const plans = load(storage).filter((p) => p.id !== id);
  storage.set(STORAGE_KEY, JSON.stringify(plans));
}

export function searchArchivedPlans(
  plans: ArchivedPlan[],
  query: string,
  tag: string | null
): ArchivedPlan[] {
  let result = plans;
  const q = query.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.preferences.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (tag) {
    result = result.filter((p) => p.tags.includes(tag));
  }
  return result;
}
