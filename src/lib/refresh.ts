import { classify } from "./classify";
import { MANUAL_COOLDOWN_MS, SOURCE_TIMEOUT_MS } from "./config";
import {
  beginImmediate,
  commit,
  deleteDeal,
  findDealByCanonical,
  finishRound,
  getMeta,
  insertDeal,
  insertRound,
  insertSourceRun,
  listDeals,
  rollback,
  setMeta,
  updateDeal,
} from "./db";
import { normalizeError, type FetchLike } from "./http";
import { isStale } from "./retention";
import { listSources, loadSource } from "./sources";
import type { BoardState, ParsedItem } from "./types";
import { canonicalUrl } from "./url";
import { getBoardState } from "./board";
import { writeDealSnapshot } from "./snapshot";
import { releaseRefreshLock, resetRefreshLockForTests, tryAcquireRefreshLock } from "./refresh-lock";

export { resetRefreshLockForTests };

export class RefreshRejected extends Error {
  code: "BUSY" | "COOLDOWN";
  retryAfterMs?: number;
  constructor(code: "BUSY" | "COOLDOWN", message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RefreshRejected";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

type LoadedSource =
  | {
      sourceId: string;
      ok: true;
      items: ParsedItem[];
      finalUrl: string;
      startedAt: number;
      finishedAt: number;
    }
  | {
      sourceId: string;
      ok: false;
      error: string;
      startedAt: number;
      finishedAt: number;
    };

export type RefreshOptions = {
  trigger: "manual" | "schedule";
  now?: number;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  cooldownMs?: number;
};

function startTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
  }, ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

async function fetchAll(options: Required<Pick<RefreshOptions, "now" | "timeoutMs">> & {
  fetchImpl: FetchLike;
}): Promise<LoadedSource[]> {
  const sources = listSources();
  return Promise.all(
    sources.map(async (source): Promise<LoadedSource> => {
      const startedAt = Date.now();
      const timeout = startTimeout(options.timeoutMs);
      try {
        const loaded = await loadSource(source, {
          fetchImpl: options.fetchImpl,
          signal: timeout.signal,
          now: options.now,
        });
        return {
          sourceId: source.id,
          ok: true,
          items: loaded.items,
          finalUrl: loaded.finalUrl,
          startedAt,
          finishedAt: Date.now(),
        };
      } catch (error) {
        return {
          sourceId: source.id,
          ok: false,
          error: normalizeError(error),
          startedAt,
          finishedAt: Date.now(),
        };
      } finally {
        timeout.cancel();
      }
    }),
  );
}

function applySource(loaded: LoadedSource, roundId: number, now: number): void {
  if (!loaded.ok) {
    insertSourceRun({
      roundId,
      sourceId: loaded.sourceId,
      ok: false,
      fetchedCount: 0,
      insertedCount: 0,
      error: loaded.error,
      finalUrl: null,
      startedAt: loaded.startedAt,
      finishedAt: loaded.finishedAt,
    });
    return;
  }

  let inserted = 0;
  const epicKeep = new Set<string>();
  for (const item of loaded.items) {
    let canonical: string;
    try {
      canonical = canonicalUrl(item.url);
    } catch {
      continue;
    }
    const publishedAt = item.publishedAt;
    const expiresAt = item.expiresAt;
    if (
      isStale(
        { publishedAt, firstSeenAt: now, expiresAt },
        now,
      )
    ) {
      continue;
    }
    const title = item.title.trim();
    if (!title) continue;
    const existing = findDealByCanonical(canonical);
    if (existing && existing.sourceId !== loaded.sourceId) {
      if (loaded.sourceId === "epic") epicKeep.add(existing.canonicalUrl);
      continue;
    }
    const category = classify(title, loaded.sourceId);
    if (!existing) {
      insertDeal({
        canonicalUrl: canonical,
        url: canonical,
        title,
        summary: item.summary,
        category,
        sourceId: loaded.sourceId,
        publishedAt,
        expiresAt,
        firstSeenAt: now,
        firstSeenRoundId: roundId,
        updatedAt: now,
      });
      inserted += 1;
    } else {
      updateDeal(existing.id, {
        url: canonical,
        title,
        summary: item.summary,
        category,
        publishedAt: publishedAt ?? existing.publishedAt,
        expiresAt,
        updatedAt: now,
      });
    }
    if (loaded.sourceId === "epic") epicKeep.add(canonical);
  }

  if (loaded.sourceId === "epic") {
    for (const deal of listDeals()) {
      if (deal.sourceId === "epic" && !epicKeep.has(deal.canonicalUrl)) deleteDeal(deal.id);
    }
  }

  insertSourceRun({
    roundId,
    sourceId: loaded.sourceId,
    ok: true,
    fetchedCount: loaded.items.length,
    insertedCount: inserted,
    error: null,
    finalUrl: loaded.finalUrl,
    startedAt: loaded.startedAt,
    finishedAt: loaded.finishedAt,
  });
}

function purgeStale(now: number): void {
  for (const deal of listDeals()) {
    if (
      isStale(
        {
          publishedAt: deal.publishedAt,
          firstSeenAt: deal.firstSeenAt,
          expiresAt: deal.expiresAt,
        },
        now,
      )
    ) {
      deleteDeal(deal.id);
    }
  }
}

/**
 * One refresh round. Overlapping calls fail fast.
 * A source that throws does not update deals already stored for that source.
 * Epic is reconciled only after a successful parse: games no longer free are removed.
 * Other sources keep items that scrolled off the feed until the 7-day or expiry boundary.
 */
export async function runRefresh(options: RefreshOptions): Promise<BoardState> {
  const now = options.now ?? Date.now();
  const cooldownMs = options.cooldownMs ?? MANUAL_COOLDOWN_MS;
  if (!tryAcquireRefreshLock()) {
    throw new RefreshRejected("BUSY", "已有刷新进行中");
  }

  try {
  if (options.trigger === "manual") {
    const last = getMeta("last_manual_at");
    if (last && now - Number(last) < cooldownMs) {
      throw new RefreshRejected(
        "COOLDOWN",
        "刷新过于频繁，请稍后再试",
        cooldownMs - (now - Number(last)),
      );
    }
    setMeta("last_manual_at", String(now));
  }
    const loaded = await fetchAll({
      now,
      timeoutMs: options.timeoutMs ?? SOURCE_TIMEOUT_MS,
      fetchImpl: options.fetchImpl ?? fetch,
    });
    beginImmediate();
    let roundId = 0;
    try {
      roundId = insertRound(options.trigger, now);
      for (const source of loaded) applySource(source, roundId, now);
      purgeStale(now);
      const okCount = loaded.filter((source) => source.ok).length;
      const status = okCount === loaded.length ? "success" : okCount === 0 ? "failed" : "partial";
      finishRound(roundId, Date.now(), status);
      commit();
    } catch (error) {
      try {
        rollback();
      } catch {
        // Already rolled back or never opened.
      }
      throw error;
    }
  } finally {
    releaseRefreshLock();
  }
  const board = getBoardState(now);
  try {
    writeDealSnapshot(board);
  } catch (error) {
    console.error("[deals] snapshot write failed", error);
  }
  return board;
}
