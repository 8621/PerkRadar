import { EXPIRING_SOON_MS } from "./config";
import {
  getMeta,
  latestFinishedRound,
  listDeals,
  listSourceRuns,
  recoverDanglingRounds,
} from "./db";
import { isExpiringSoon, isStale } from "./retention";
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
    title: deal.title,
    summary: deal.summary,
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
  };
}

export { EXPIRING_SOON_MS };
