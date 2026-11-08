import { cleanTitle, excerpt } from "../text";
import type { ParsedItem } from "../types";

type EpicOffer = {
  startDate?: string;
  endDate?: string;
  discountSetting?: { discountPercentage?: number; discountType?: string };
};

type EpicElement = {
  title?: string;
  description?: string;
  productSlug?: string | null;
  offerMappings?: { pageSlug?: string; pageType?: string }[];
  catalogNs?: { mappings?: { pageSlug?: string; pageType?: string }[] };
  price?: { totalPrice?: { discountPrice?: number } };
  promotions?: {
    promotionalOffers?: { promotionalOffers?: EpicOffer[] }[];
    upcomingPromotionalOffers?: { promotionalOffers?: EpicOffer[] }[];
  };
};

function pageSlug(element: EpicElement): string | null {
  const mappings = [
    ...(element.offerMappings ?? []),
    ...(element.catalogNs?.mappings ?? []),
  ];
  const home = mappings.find(
    (mapping) =>
      mapping.pageType === "productHome" &&
      typeof mapping.pageSlug === "string" &&
      mapping.pageSlug.length > 0 &&
      mapping.pageSlug !== "home",
  );
  if (home?.pageSlug) return home.pageSlug;
  if (typeof element.productSlug === "string" && element.productSlug.length > 0) {
    return element.productSlug;
  }
  return null;
}

function currentOffers(element: EpicElement): EpicOffer[] {
  const groups = element.promotions?.promotionalOffers ?? [];
  return groups.flatMap((group) => group.promotionalOffers ?? []);
}

/**
 * Keep only promotions that are free and active at `now`.
 * Upcoming promotions are ignored. Paid discounts are ignored.
 * Epic encodes a free percentage discount as 0 on this endpoint; the price must also be 0.
 * The window is half-open: start <= now < end. The stored expiry is that offer's end.
 */
export function parseEpicFreeGames(payload: unknown, now: number): ParsedItem[] {
  const elements = (payload as { data?: { Catalog?: { searchStore?: { elements?: unknown } } } })?.data
    ?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) throw new Error("Epic 响应缺少商品列表");

  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  for (const raw of elements) {
    if (!raw || typeof raw !== "object") continue;
    const element = raw as EpicElement;
    const discountPrice = element.price?.totalPrice?.discountPrice;
    if (typeof discountPrice !== "number" || discountPrice !== 0) continue;
    const active = currentOffers(element).filter((offer) => {
      const start = Date.parse(offer.startDate ?? "");
      const end = Date.parse(offer.endDate ?? "");
      const percentage = offer.discountSetting?.discountPercentage;
      const freePercent = percentage === 0 || percentage === 100;
      return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end && freePercent;
    });
    if (active.length === 0) continue;
    const slug = pageSlug(element);
    const title = cleanTitle(element.title ?? "");
    if (!slug || slug.includes("..") || !title) continue;
    const url = `https://store.epicgames.com/zh-CN/p/${slug}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const ends = active.map((offer) => Date.parse(offer.endDate ?? ""));
    const starts = active.map((offer) => Date.parse(offer.startDate ?? ""));
    items.push({
      url,
      title,
      summary: excerpt(element.description ?? ""),
      publishedAt: Math.min(...starts),
      expiresAt: Math.max(...ends),
    });
  }
  return items;
}
