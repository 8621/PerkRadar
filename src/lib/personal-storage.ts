export type Personal = { claimed: string[]; favorites: string[] };
export const STORAGE_KEY = "perkradar-personal-v1";
export const LEGACY_STORAGE_KEY = "daily-deals-personal-v1";
export const SHOW_ALL_KEY = "perkradar-show-all-v1";
export const LEGACY_SHOW_ALL_KEY = "daily-deals-show-all-v1";
type Store = Pick<Storage, "getItem" | "setItem">;
export function loadPersonal(store: Store, fallback: Personal = { claimed: [], favorites: [] }): Personal {
  try {
    const current = store.getItem(STORAGE_KEY);
    const raw = current ?? store.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 10_000) : [];
    const result = { claimed: strings(parsed.claimed), favorites: strings(parsed.favorites) };
    if (current === null) { try { store.setItem(STORAGE_KEY, JSON.stringify(result)); } catch { /* legacy stays intact */ } }
    return result;
  } catch { return fallback; }
}
export function loadShowAll(store: Store): boolean {
  try {
    const current = store.getItem(SHOW_ALL_KEY);
    const legacy = current ?? store.getItem(LEGACY_SHOW_ALL_KEY);
    if (legacy !== null && current === null) { try { store.setItem(SHOW_ALL_KEY, legacy); } catch { /* keep old key */ } }
    return legacy === null ? true : legacy === "1";
  } catch { return true; }
}
