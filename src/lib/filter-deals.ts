import type { Category, DealDTO } from "./types";

export type DealSort = "newest" | "expiring";

export type DealFilters = {
  query: string;
  sourceId: string | "all";
  category: Category | "all" | "favorites";
  onlyNew: boolean;
  sort?: DealSort;
};

export function filterDeals(
  deals: DealDTO[],
  filters: DealFilters,
  personal: { claimed: string[]; favorites: string[] },
): DealDTO[] {
  const query = filters.query.trim().toLowerCase();
  const claimed = new Set(personal.claimed);
  const favorites = new Set(personal.favorites);
  const matched = deals.filter((deal) => {
    if (query && !deal.title.toLowerCase().includes(query)) return false;
    if (filters.sourceId !== "all" && deal.sourceId !== filters.sourceId) return false;
    if (filters.onlyNew && !deal.isNew) return false;
    if (filters.category === "favorites") return favorites.has(deal.canonicalUrl);
    if (filters.category !== "all" && deal.category !== filters.category) return false;
    return true;
  });
  return matched.sort((a, b) => {
    const aClaimed = claimed.has(a.canonicalUrl) ? 1 : 0;
    const bClaimed = claimed.has(b.canonicalUrl) ? 1 : 0;
    if (aClaimed !== bClaimed) return aClaimed - bClaimed;
    if (filters.sort === "expiring") {
      const aExpiry = a.expiresAt ?? Number.POSITIVE_INFINITY;
      const bExpiry = b.expiresAt ?? Number.POSITIVE_INFINITY;
      if (aExpiry !== bExpiry) return aExpiry - bExpiry;
    }
    const aTime = a.publishedAt ?? 0;
    const bTime = b.publishedAt ?? 0;
    return bTime - aTime;
  });
}
