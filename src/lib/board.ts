import { EXPIRING_SOON_MS, SEVERE_AFTER_MS, STALE_AFTER_MS } from "./config";
import {
  getMeta,
  latestFinishedRound,
  listDeals,
  listSourceRuns,
  previousSourceRuns,
  recentSourceRuns,
  recoverDanglingRounds,
} from "./db";
import { isExpiringSoon, isStale } from "./retention";
import { toPlain } from "./text";
import { isRefreshRunning } from "./refresh-lock";
import { SOURCE_DEFS, sourceName } from "./source-defs";
import { formatBeijing } from "./time";
import type { BoardState, Category, DealDTO, SourceStatus } from "./types";
import { CATEGORIES } from "./types";

function asCategory(value: string): Category {
  return CATEGORIES.includes(value as Category) ? (value as Category) : "其他";
}

export function getBoardState(now = Date.now()): BoardState {
  recoverDanglingRounds(now);
  const round = latestFinishedRound();
  const runs = round ? listSourceRuns(round.id) : [];
  const runBySource = new Map(runs.map((run) => [run.sourceId, run]));
  const active = listDeals().filter(
    (deal) =>
      !isStale(
        {
          publishedAt: deal.publishedAt,
          firstSeenAt: deal.firstSeenAt,
          expiresAt: deal.expiresAt,
        },
        now,
      ),
  );

  const deals: DealDTO[] = active.map((deal) => ({
    id: deal.id,
    url: deal.url,
    canonicalUrl: deal.canonicalUrl,
    // Rows written before the noise rules existed stay dirty until their source
    // re-lists them, which can outlast the 7-day window. Re-clean on read instead
    // of rewriting the user's database; toPlain is idempotent.
    title: toPlain(deal.title),
    summary: toPlain(deal.summary),
    category: asCategory(deal.category),
    sourceId: deal.sourceId,
    sourceName: sourceName(deal.sourceId),
    publishedAt: deal.publishedAt,
    expiresAt: deal.expiresAt,
    publishedLabel: deal.publishedAt == null ? null : formatBeijing(deal.publishedAt),
    expiresLabel: deal.expiresAt == null ? null : formatBeijing(deal.expiresAt),
    expiresSoon: isExpiringSoon(deal.expiresAt, now),
    isNew: round != null && deal.firstSeenRoundId === round.id,
  }));

  const qualityBySource = new Map(
    SOURCE_DEFS.map((source) => {
      const recent = recentSourceRuns(source.id, 8);
      let consecutiveFailures = 0;
      for (const run of recent) {
        if (run.ok) break;
        consecutiveFailures += 1;
      }
      const current = recent[0];
      const previous = recent[1];
      const countDrop = Boolean(
        current && current.ok && previous && previous.ok && previous.fetchedCount > 0 && current.fetchedCount <= previous.fetchedCount / 2,
      );
      const structureAnomaly = Boolean(
        current &&
          !current.ok &&
          /未能解析|商品列表|网页而不是订阅源|不是 JSON|LINUX DO 福利列表|Markdown 解析出条目/.test(current.error ?? ""),
      );
      const warnings: string[] = [];
      if (consecutiveFailures >= 3) warnings.push(`连续失败 ${consecutiveFailures} 轮`);
      if (countDrop) warnings.push(`解析条数骤降至 ${current!.fetchedCount}`);
      if (structureAnomaly) warnings.push("解析结构异常");
      return [source.id, { consecutiveFailures, countDrop, structureAnomaly, warning: warnings.length ? warnings.join("；") : null }] as const;
    }),
  );

  const sources: SourceStatus[] = SOURCE_DEFS.map((source) => {
    const run = runBySource.get(source.id);
    return {
      id: source.id,
      name: source.name,
      activeCount: deals.filter((deal) => deal.sourceId === source.id).length,
      lastOk: run ? run.ok : null,
      lastError: run?.error ?? null,
      lastFetched: run ? run.fetchedCount : null,
      lastInserted: run ? run.insertedCount : null,
      lastFinalUrl: run?.finalUrl ?? null,
      quality: qualityBySource.get(source.id),
    };
  });

  const failures = sources
    .filter((source) => source.lastOk === false)
    .map((source) => ({
      sourceId: source.id,
      sourceName: source.name,
      error: source.lastError || "抓取失败",
    }));

  const ok = sources.filter((source) => source.lastOk === true).length;
  const nextRaw = getMeta("next_refresh_at");
  const nextRefreshAt = nextRaw ? Number(nextRaw) : null;
  const lastUpdatedAt = round?.finishedAt ?? null;

  const lastRoundAgeMs = lastUpdatedAt == null ? null : Math.max(0, now - lastUpdatedAt);
  const stale = lastRoundAgeMs != null && lastRoundAgeMs > STALE_AFTER_MS;
  const severe = lastRoundAgeMs != null && lastRoundAgeMs > SEVERE_AFTER_MS;
  const anomalies: string[] = [];
  if (lastUpdatedAt == null) {
    anomalies.push("还没有完成任何一轮抓取，页面数据不能当作当前清单");
  } else if (severe) {
    anomalies.push("最近一轮已超过 4 小时，页面条目只能当历史抓取");
  } else if (stale) {
    anomalies.push("最近一轮已超过 2.5 小时，请先确认容器与刷新状态");
  }
  if (round?.status === "failed") anomalies.push("上一轮所有来源都失败");

  const previous = round ? previousSourceRuns(round.id) : [];
  const previousBySource = new Map(previous.map((run) => [run.sourceId, run]));
  for (const source of sources) {
    const before = previousBySource.get(source.id);
    if (before && source.lastOk === true && before.fetchedCount > 0 && source.lastFetched != null) {
      const drop = (before.fetchedCount - source.lastFetched) / before.fetchedCount;
      if (drop >= 0.5) {
        anomalies.push(`${source.name} 解析条数从 ${before.fetchedCount} 降到 ${source.lastFetched}`);
      }
    } else if (source.lastOk === true && source.lastFetched === 0) {
      anomalies.push(`${source.name} 本轮成功但解析到 0 条`);
    }
    if (source.quality?.consecutiveFailures && source.quality.consecutiveFailures >= 3) {
      anomalies.push(`${source.name} 连续失败 ${source.quality.consecutiveFailures} 轮`);
    }
    if (source.quality?.structureAnomaly) anomalies.push(`${source.name} 解析结构异常`);
  }

  return {
    generatedAt: now,
    lastUpdatedAt,
    lastUpdatedLabel: lastUpdatedAt == null ? null : formatBeijing(lastUpdatedAt),
    nextRefreshAt: Number.isFinite(nextRefreshAt) ? nextRefreshAt : null,
    nextRefreshLabel:
      nextRefreshAt != null && Number.isFinite(nextRefreshAt) ? formatBeijing(nextRefreshAt) : null,
    sourceHealth: { ok, total: SOURCE_DEFS.length },
    activeCount: deals.length,
    newCount: deals.filter((deal) => deal.isNew).length,
    refreshInProgress: isRefreshRunning(),
    roundStatus:
      round && (round.status === "success" || round.status === "partial" || round.status === "failed")
        ? round.status
        : null,
    failures,
    sources,
    deals,
    freshness: { lastRoundAgeMs, stale, severe },
    anomalies,
  };
}

export { EXPIRING_SOON_MS };
