import { BOARD_MAX_ITEMS, RETENTION_MS } from "./config";
import { safeDisplayText, safeHttpUrl } from "./board-view";
import { SOURCE_DEFS } from "./source-defs";
import type { DealSnapshot, DealSnapshotItem } from "./snapshot";
import { canonicalUrl } from "./url";

type PublishedSnapshot = DealSnapshot & { baselineAvailable?: boolean };
export type SnapshotPublishStatus = Pick<DealSnapshot, "roundStatus" | "sourceHealth" | "failures"> & {
  attemptedAt: string;
  retainedPrevious: boolean;
};
export type SnapshotPublication = {
  latest: PublishedSnapshot;
  previous: DealSnapshot | null;
  status: SnapshotPublishStatus;
};

/** 校验发布边界；缺失的历史返回 null，损坏的历史不能当作空基线。 */
export function readPublicSnapshot(value: unknown): PublishedSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as PublishedSnapshot;
  if (snapshot.schema !== "daily-deals.snapshot.v1" || !Number.isFinite(Date.parse(snapshot.fetchedAt)) ||
      !Number.isFinite(Date.parse(snapshot.freshUntil)) || !Array.isArray(snapshot.items) ||
      snapshot.items.length > BOARD_MAX_ITEMS || !Array.isArray(snapshot.sources) ||
      !snapshot.sourceHealth || !Number.isInteger(snapshot.sourceHealth.ok) ||
      !Number.isInteger(snapshot.sourceHealth.total) || !Array.isArray(snapshot.failures)) return null;
  for (const item of snapshot.items) {
    if (!item || typeof item !== "object" || typeof item.title !== "string" ||
        typeof item.category !== "string" || !safeHttpUrl(item.url)) return null;
    const source = SOURCE_DEFS.find((entry) => entry.id === item.sourceId);
    const host = new URL(item.url).hostname;
    if (!source || !source.allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
    if (item.publishedAt !== null && (typeof item.publishedAt !== "string" || !Number.isFinite(Date.parse(item.publishedAt)))) return null;
    if (item.expiresAt !== null && (typeof item.expiresAt !== "string" || !Number.isFinite(Date.parse(item.expiresAt)))) return null;
    if (item.firstSeenAt !== undefined && (typeof item.firstSeenAt !== "string" || !Number.isFinite(Date.parse(item.firstSeenAt)))) return null;
  }
  return snapshot;
}

/** 按同一在架窗口裁剪历史；保留首次观测时间，不把每次抓取当成首次入库。 */
function activeItem(item: DealSnapshotItem, firstSeenAt: string, now: number): DealSnapshotItem | null {
  const published = item.publishedAt === null ? Date.parse(firstSeenAt) : Date.parse(item.publishedAt);
  if (!Number.isFinite(published) || published < now - RETENTION_MS ||
      (item.expiresAt !== null && Date.parse(item.expiresAt) <= now)) return null;
  const source = SOURCE_DEFS.find((entry) => entry.id === item.sourceId)!;
  return {
    title: safeDisplayText(item.title, 300),
    url: canonicalUrl(item.url),
    sourceId: source.id,
    sourceName: source.name,
    category: item.category,
    publishedAt: item.publishedAt,
    publishedAtBeijing: item.publishedAtBeijing,
    expiresAt: item.expiresAt,
    expiresAtBeijing: item.expiresAtBeijing,
    firstSeenAt,
    isNew: false,
  };
}

/** 将本轮结果晋升为公开快照；全失败保留旧时间，部分失败保留各来源有效旧条目。 */
export function prepareSnapshotPublication(current: DealSnapshot, previous: DealSnapshot | null): SnapshotPublication {
  if (!readPublicSnapshot(current)) throw new Error("本轮快照格式无效，停止发布");
  if (previous && !readPublicSnapshot(previous)) throw new Error("上一轮快照格式无效，停止发布");
  const status: SnapshotPublishStatus = {
    attemptedAt: current.fetchedAt,
    roundStatus: current.roundStatus,
    sourceHealth: current.sourceHealth,
    failures: current.failures,
    retainedPrevious: current.sourceHealth.ok === 0,
  };
  if (current.sourceHealth.ok === 0) {
    if (!previous) throw new Error("本轮全部来源失败且没有有效历史快照，停止发布");
    return { latest: previous, previous, status };
  }
  const now = Date.parse(current.fetchedAt);
  const oldItems = new Map((previous?.items ?? []).map((item) => [canonicalUrl(item.url), item]));
  const merged = new Map<string, DealSnapshotItem>();
  const epicOk = current.sources.some((source) => source.id === "epic" && source.ok === true);
  for (const item of oldItems.values()) {
    // Epic 的成功响应是完整的当前免费集合；不能把已撤下的促销从旧快照补回来。
    if (item.sourceId === "epic" && epicOk) continue;
    const active = activeItem(item, item.firstSeenAt ?? previous!.fetchedAt, now);
    if (active) merged.set(active.url, active);
  }
  for (const item of current.items) {
    const key = canonicalUrl(item.url);
    const old = oldItems.get(key);
    const firstSeenAt = old?.firstSeenAt ?? (old ? previous!.fetchedAt : current.fetchedAt);
    // 某次 feed 缺少日期时沿用已知日期，与正式入库逻辑一致，避免旧条目重新在架。
    const candidate = item.publishedAt === null && old?.publishedAt != null
      ? { ...item, publishedAt: old.publishedAt, publishedAtBeijing: old.publishedAtBeijing }
      : item;
    const active = activeItem(candidate, firstSeenAt, now);
    if (active) {
      active.isNew = previous !== null && !oldItems.has(key);
      merged.set(key, active);
    }
  }
  const items = [...merged.values()].sort((left, right) =>
    Date.parse(right.publishedAt ?? right.firstSeenAt!) - Date.parse(left.publishedAt ?? left.firstSeenAt!));
  const latest: PublishedSnapshot = {
    ...current,
    baselineAvailable: previous !== null,
    items,
    activeCount: items.length,
    newCount: items.filter((item) => item.isNew).length,
  };
  return { latest, previous, status };
}
