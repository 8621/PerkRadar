import { safeDisplayText, safeHttpUrl } from "../src/lib/board-view.js";
import { BOARD_MAX_ITEMS, RETENTION_MS, TITLE_MAX } from "../src/lib/config.js";
import { filterDeals, type DealFilters } from "../src/lib/filter-deals.js";
import { loadPersonal, STORAGE_KEY, type Personal } from "../src/lib/personal-storage.js";
import { isExpiringSoon, isStale, referenceTime } from "../src/lib/retention.js";
import { SOURCE_DEFS } from "../src/lib/source-defs.js";
import { CATEGORIES, type BoardState, type DealDTO, type FailureDTO } from "../src/lib/types.js";
import { canonicalUrl } from "../src/lib/url.js";

export type ViewerItem = DealDTO & { firstSeenAt: number };
export type ViewerSnapshot = {
  fetchedAt: number;
  freshUntil: number;
  baselineAvailable?: boolean;
  roundStatus: BoardState["roundStatus"];
  sourceHealth: BoardState["sourceHealth"];
  failures: FailureDTO[];
  items: ViewerItem[];
};
export type SnapshotStatus = {
  attemptedAt: number;
  roundStatus: BoardState["roundStatus"];
  sourceHealth: BoardState["sourceHealth"];
  failures: FailureDTO[];
  retainedPrevious: boolean;
};
export type SnapshotBundle = { latest: ViewerSnapshot; previous: ViewerSnapshot | null; status: SnapshotStatus | null };
type RecordValue = Record<string, unknown>;
type StorageLike = Pick<Storage, "getItem" | "setItem">;
const POLL_MS = 30_000;

/** 快照是外部输入，只接受普通对象，避免异常 JSON 影响渲染。 */
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 公开快照时间必须为可解析字符串；空值保持未知。 */
function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

/** 轮次字段保持和正式看板相同的枚举边界。 */
function roundStatus(value: unknown): BoardState["roundStatus"] {
  return value === "success" || value === "partial" || value === "failed" ? value : null;
}

/** 来源成败只展示实际合法计数，拒绝矛盾的总数。 */
function health(value: unknown): BoardState["sourceHealth"] | null {
  if (!record(value)) return null;
  const { ok, total } = value;
  if (typeof ok !== "number" || typeof total !== "number" || !Number.isSafeInteger(ok) || !Number.isSafeInteger(total) || ok < 0 || total < ok) return null;
  return { ok, total };
}

/** 错误文案只作为文本展示，长度沿用看板的显示边界。 */
function failures(value: unknown): FailureDTO[] {
  if (!Array.isArray(value)) return [];
  return value.filter(record).slice(0, 100).map((entry) => ({
    sourceId: safeDisplayText(entry.sourceId, 80),
    sourceName: safeDisplayText(entry.sourceName, 80),
    error: safeDisplayText(entry.error, 160) || "抓取失败",
  }));
}

/** 原文链接同时受协议和既有来源域名限制，复用正式看板的 URL 清洗。 */
function sourceItem(value: unknown, index: number, fetchedAt: number): ViewerItem | null {
  if (!record(value)) return null;
  const safeUrl = safeHttpUrl(value.url);
  const url = safeUrl ? canonicalUrl(safeUrl) : null;
  const source = SOURCE_DEFS.find((entry) => entry.id === value.sourceId);
  if (!url || !source) return null;
  const host = new URL(url).hostname.toLowerCase();
  if (!source.allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
  const title = safeDisplayText(value.title, TITLE_MAX);
  if (!title) return null;
  for (const key of ["publishedAt", "expiresAt", "firstSeenAt"] as const) {
    if (value[key] !== undefined && value[key] !== null && timestamp(value[key]) === null) return null;
  }
  const category = (CATEGORIES as readonly unknown[]).includes(value.category) ? value.category as DealDTO["category"] : "其他";
  return {
    id: index,
    url,
    canonicalUrl: url,
    title,
    summary: "",
    category,
    sourceId: source.id,
    sourceName: source.name,
    publishedAt: timestamp(value.publishedAt),
    firstSeenAt: timestamp(value.firstSeenAt) ?? timestamp(value.publishedAt) ?? fetchedAt,
    expiresAt: timestamp(value.expiresAt),
    publishedLabel: null,
    expiresLabel: null,
    expiresSoon: false,
    isNew: value.isNew === true,
  };
}

/** 拒绝缺时间、错误结构和不安全条目；无效旧文件不能充当新增基线。 */
export function parseSnapshot(value: unknown): ViewerSnapshot | null {
  if (!record(value) || value.schema !== "daily-deals.snapshot.v1" || !Array.isArray(value.items) || value.items.length > BOARD_MAX_ITEMS) return null;
  const fetchedAt = timestamp(value.fetchedAt);
  const freshUntil = timestamp(value.freshUntil);
  const sourceHealth = health(value.sourceHealth);
  if (fetchedAt === null || freshUntil === null || !sourceHealth || (value.baselineAvailable !== undefined && typeof value.baselineAvailable !== "boolean")) return null;
  const items: ViewerItem[] = [];
  const urls = new Set<string>();
  for (const [index, raw] of value.items.entries()) {
    const item = sourceItem(raw, index, fetchedAt);
    if (!item) return null;
    if (urls.has(item.canonicalUrl)) continue;
    urls.add(item.canonicalUrl);
    items.push(item);
  }
  return { fetchedAt, freshUntil, sourceHealth, items, roundStatus: roundStatus(value.roundStatus), failures: failures(value.failures), baselineAvailable: value.baselineAvailable as boolean | undefined };
}

/** status 独立记录最近一次尝试，不覆盖上一次正常快照的时间。 */
export function parseSnapshotStatus(value: unknown): SnapshotStatus | null {
  if (!record(value)) return null;
  const attemptedAt = timestamp(value.attemptedAt);
  const sourceHealth = health(value.sourceHealth);
  if (attemptedAt === null || !sourceHealth || typeof value.retainedPrevious !== "boolean") return null;
  return { attemptedAt, sourceHealth, roundStatus: roundStatus(value.roundStatus), failures: failures(value.failures), retainedPrevious: value.retainedPrevious };
}

/** 新版使用发布时的新增结果；旧版仅在取得有效前一轮时做 URL 差集。 */
export function activeDeals(snapshot: ViewerSnapshot, previous: ViewerSnapshot | null, now: number, status: SnapshotStatus | null = null): ViewerItem[] {
  const baseline = previous && previous.fetchedAt < snapshot.fetchedAt ? previous : null;
  const previousUrls = new Set(baseline?.items.map((item) => item.canonicalUrl) ?? []);
  const retained = snapshot.roundStatus === "failed" || snapshot.sourceHealth.ok === 0 || (status !== null && status.attemptedAt >= snapshot.fetchedAt && status.retainedPrevious);
  return snapshot.items.filter((item) => !isStale(item, now)).map((item) => ({
    ...item,
    isNew: !retained && (snapshot.baselineAvailable === undefined ? baseline !== null && !previousUrls.has(item.canonicalUrl) : snapshot.baselineAvailable && item.isNew),
    expiresSoon: isExpiringSoon(item.expiresAt, now),
    publishedLabel: item.publishedAt === null ? null : formatTime(item.publishedAt),
    expiresLabel: item.expiresAt === null ? null : formatTime(item.expiresAt),
  }));
}

/** 标题、分类、来源、收藏和已领顺序与正式看板使用同一个过滤器。 */
export function selectDeals(snapshot: ViewerSnapshot, previous: ViewerSnapshot | null, filters: DealFilters, personal: Personal, now: number, onlyFavorites = false, status: SnapshotStatus | null = null): DealDTO[] {
  const shown = filterDeals(activeDeals(snapshot, previous, now, status), filters, personal);
  return onlyFavorites ? shown.filter((item) => personal.favorites.includes(item.canonicalUrl)) : shown;
}

/** 没有可展示的 latest 时仍向页面传递本次真实失败状态。 */
export class SnapshotLoadError extends Error {
  constructor(message: string, readonly status: SnapshotStatus | null) {
    super(message);
    this.name = "SnapshotLoadError";
  }
}

/** 三个文件立即并行读取，旧基线和状态缺失可降级，latest 失败则保留给调用方重试。 */
export async function loadSnapshotBundle(fetcher: typeof fetch, signal?: AbortSignal): Promise<SnapshotBundle> {
  const load = async (name: string): Promise<unknown> => {
    const response = await fetcher(name, { cache: "no-store", signal });
    if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
    return response.json();
  };
  const [latestResult, previousResult, statusResult] = await Promise.allSettled([load("latest.json"), load("previous.json"), load("status.json")]);
  const status = statusResult.status === "fulfilled" ? parseSnapshotStatus(statusResult.value) : null;
  if (latestResult.status === "rejected") throw new SnapshotLoadError(latestResult.reason instanceof Error ? latestResult.reason.message : "latest.json 读取失败", status);
  const latest = parseSnapshot(latestResult.value);
  if (!latest) throw new SnapshotLoadError("latest.json 不是有效的公开快照", status);
  return {
    latest,
    previous: previousResult.status === "fulfilled" ? parseSnapshot(previousResult.value) : null,
    status,
  };
}

/** localStorage 的 getter 自身也可能抛错，加载失败仍保留可操作的页内状态。 */
export function loadViewerPersonal(getStorage: () => StorageLike): { personal: Personal; warning: string | null } {
  const empty: Personal = { claimed: [], favorites: [] };
  const warning = "浏览器存储不可用或已保存内容无法读取；收藏与已领仍可在本页操作，可能无法保存。";
  try {
    const storage = getStorage();
    let readFailed = false;
    const personal = loadPersonal({
      getItem: (key) => {
        let raw: string | null;
        try { raw = storage.getItem(key); } catch (error) { readFailed = true; throw error; }
        if (raw !== null) {
          try {
            const value: unknown = JSON.parse(raw);
            if (!record(value) || !Array.isArray(value.claimed) || !Array.isArray(value.favorites)) readFailed = true;
          } catch { readFailed = true; }
        }
        return raw;
      },
      setItem: (key, value) => {
        try { storage.setItem(key, value); } catch (error) { readFailed = true; throw error; }
      },
    });
    return { personal, warning: readFailed ? warning : null };
  } catch {
    return { personal: empty, warning };
  }
}

/** 保存失败不回滚当前页面的选择，调用方应持续显示明确的未保存提示。 */
export function saveViewerPersonal(getStorage: () => StorageLike, personal: Personal): boolean {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(personal));
    return true;
  } catch { return false; }
}

/** 到期、七天留存和新鲜度边界按实际时刻刷新；最长三十秒再复核一次。 */
export function nextBoundaryDelay(snapshot: ViewerSnapshot | null, now: number): number {
  let delay = POLL_MS;
  const consider = (at: number) => {
    if (at > now) delay = Math.min(delay, at - now);
  };
  if (snapshot) {
    consider(snapshot.freshUntil);
    for (const item of snapshot.items) {
      if (item.expiresAt !== null) consider(item.expiresAt);
      consider(referenceTime(item) + RETENTION_MS + 1);
    }
  }
  return Math.max(1, Math.min(POLL_MS, delay));
}

const beijing = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** 统一按北京时间显示真实抓取和活动时间，不信任快照里的展示字符串。 */
export function formatTime(at: number): string {
  return beijing.format(at);
}
