import type { Category, DealDTO } from "./types";

export type DealSort = "newest" | "expiring";

export type DealFilters = {
  query: string;
  sourceId: string | "all";
  category: Category | "all" | "favorites";
  onlyNew: boolean;
  sort?: DealSort;
  /** 默认 true；只有明确传 false 才隐藏「其他」，避免影响既有调用。 */
  includeOther?: boolean;
};

type Loose = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(value.filter((item): item is string => typeof item === "string"));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 合法数据保持原有顺序；畸形字段按空值处理，避免异常接口响应让页面白屏。 */
export function filterDeals(
  deals: DealDTO[],
  filters: DealFilters,
  personal: { claimed: string[]; favorites: string[] },
): DealDTO[] {
  const looseFilters = filters as unknown as Loose;
  const loosePersonal = personal as unknown as Loose;
  const query = text(looseFilters.query).trim().toLowerCase();
  const sourceId = text(looseFilters.sourceId) || "all";
  const category = text(looseFilters.category) || "all";
  const onlyNew = looseFilters.onlyNew === true;
  const sort = looseFilters.sort === "expiring" ? "expiring" : undefined;
  // 省略字段时保持旧行为；正式页只在「全部」视图把「其他」排除。
  const includeOther = looseFilters.includeOther !== false;
  const claimed = stringSet(loosePersonal.claimed);
  const favorites = stringSet(loosePersonal.favorites);
  const list = Array.isArray(deals) ? deals : [];

  const matched = list.filter((item) => {
    const deal = item as unknown as Loose;
    const title = text(deal.title).toLowerCase();
    // 搜索是字面包含，不把输入当正则；正则里的 .* 等字符只当普通文本。
    if (query && !title.includes(query)) return false;
    if (sourceId !== "all" && sourceId !== text(deal.sourceId)) return false;
    if (onlyNew && deal.isNew !== true) return false;
    const canonicalUrl = text(deal.canonicalUrl);
    if (!includeOther && text(deal.category) === "其他") return false;
    if (category === "favorites") return favorites.has(canonicalUrl);
    if (category !== "all" && category !== text(deal.category)) return false;
    return true;
  });

  return matched.sort((a, b) => {
    const left = a as unknown as Loose;
    const right = b as unknown as Loose;
    const aClaimed = claimed.has(text(left.canonicalUrl)) ? 1 : 0;
    const bClaimed = claimed.has(text(right.canonicalUrl)) ? 1 : 0;
    if (aClaimed !== bClaimed) return aClaimed - bClaimed;
    if (sort === "expiring") {
      const aExpiry = finite(left.expiresAt, Number.POSITIVE_INFINITY);
      const bExpiry = finite(right.expiresAt, Number.POSITIVE_INFINITY);
      if (aExpiry !== bExpiry) return aExpiry - bExpiry;
    }
    const aTime = finite(left.publishedAt, 0);
    const bTime = finite(right.publishedAt, 0);
    return bTime - aTime;
  });
}
