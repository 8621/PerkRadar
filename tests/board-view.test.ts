/**
 * SYNTHETIC negative cases for the client view boundary.
 * Malformed SSR/API snapshots must fail closed: no invented deals, no unsafe URLs,
 * and no crash from hostile text or missing fields.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_URL_CHARS, SUMMARY_MAX, TITLE_MAX } from "../src/lib/config";
import { filterDeals } from "../src/lib/filter-deals";
import { clampText, normalizeBoardState, safeDisplayText, safeHttpUrl } from "../src/lib/board-view";
import type { DealDTO } from "../src/lib/types";

function deal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    url: "https://example.com/synthetic-safe",
    canonicalUrl: "https://example.com/synthetic-safe",
    title: "SYNTHETIC 安全线索",
    summary: "SYNTHETIC 摘要",
    category: "游戏",
    sourceId: "epic",
    sourceName: "Epic",
    publishedAt: 100,
    expiresAt: null,
    publishedLabel: "2026-11-09 06:10",
    expiresLabel: null,
    expiresSoon: false,
    isNew: true,
    ...overrides,
  };
}

function source(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "epic",
    name: "Epic",
    activeCount: 1,
    lastOk: true,
    lastError: null,
    lastFetched: 1,
    lastInserted: 1,
    lastFinalUrl: "https://store.epicgames.com/",
    ...overrides,
  };
}

function board(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generatedAt: 1,
    lastUpdatedAt: 2,
    lastUpdatedLabel: "2026-11-09 06:10",
    nextRefreshAt: 3,
    nextRefreshLabel: "2026-11-09 08:10",
    sourceHealth: { ok: 1, total: 1 },
    activeCount: 1,
    newCount: 1,
    refreshInProgress: false,
    roundStatus: "success",
    failures: [],
    sources: [source()],
    deals: [deal()],
    freshness: { lastRoundAgeMs: 0, stale: false, severe: false },
    anomalies: [],
    ...overrides,
  };
}

describe("board view adversarial input", () => {
  it("rejects a whole board when its object shape or key arrays are unusable", () => {
    assert.equal(normalizeBoardState(null), null);
    assert.equal(normalizeBoardState([]), null);
    assert.equal(normalizeBoardState({ deals: {}, sources: [], failures: [] }), null);
    assert.equal(normalizeBoardState({ deals: [], sources: {}, failures: [] }), null);
    assert.equal(normalizeBoardState({ deals: [], sources: [], failures: {} }), null);
    const empty = normalizeBoardState(board({ deals: [], sources: [], failures: [], sourceHealth: {}, activeCount: Number.NaN, newCount: Number.NaN }));
    assert.ok(empty);
    assert.deepEqual(empty.deals, []);
    assert.equal(empty.activeCount, 0);
    assert.equal(empty.freshness?.stale, false);
  });

  it("drops deals with unsafe canonical URLs and keeps the safe one", () => {
    const hostile = [
      deal({ canonicalUrl: "javascript:alert(1)" }),
      deal({ canonicalUrl: "data:text/html,<script>alert(1)</script>" }),
      deal({ canonicalUrl: "https://user:pass@example.com/phish" }),
      deal({ canonicalUrl: `https://example.com/${"a".repeat(MAX_URL_CHARS)}` }),
      deal({ canonicalUrl: 42 }),
      deal({ canonicalUrl: "https://example.com/synthetic-safe", url: "ftp://example.com/no" }),
    ];
    const normalized = normalizeBoardState(board({ deals: hostile }));
    assert.ok(normalized);
    assert.equal(normalized.deals.length, 1);
    assert.equal(normalized.deals[0]?.canonicalUrl, "https://example.com/synthetic-safe");
    assert.equal(normalized.deals[0]?.url, "https://example.com/synthetic-safe");
    assert.equal(normalized.deals.some((item) => item.url.startsWith("javascript:")), false);
  });

  it("clamps hosted text, leaves HTML as inert text and does not invent a missing summary", () => {
    const normalized = normalizeBoardState(board({
      deals: [deal({
        title: `<img src=x onerror="alert(1)">SYNTHETIC ${"长".repeat(500)}\u0000\u001f`,
        summary: undefined,
        category: "not-a-category",
        sourceId: 42,
        sourceName: null,
        publishedAt: "yesterday",
        expiresAt: Number.NaN,
        publishedLabel: 123,
        expiresLabel: 456,
        expiresSoon: "true",
        isNew: "false",
      })],
    }));
    assert.ok(normalized);
    const item = normalized.deals[0];
    assert.ok(item);
    assert.equal(item.title.includes("<img"), true);
    assert.equal(item.title.includes("\u0000"), false);
    assert.equal(item.title.includes("\u001f"), false);
    assert.ok(item.title.length <= TITLE_MAX);
    assert.equal(item.summary, "");
    assert.equal(item.category, "其他");
    assert.equal(item.sourceId, "42");
    assert.equal(item.sourceName, "");
    assert.equal(item.publishedAt, null);
    assert.equal(item.expiresAt, null);
    assert.equal(item.publishedLabel, null);
    assert.equal(item.expiresLabel, null);
    assert.equal(item.expiresSoon, false);
    assert.equal(item.isNew, false);
  });

  it("rejects unsafe URLs and accepts a plain http(s) article link", () => {
    assert.equal(safeHttpUrl("https://example.com/a"), "https://example.com/a");
    assert.equal(safeHttpUrl("javascript:alert(1)"), null);
    assert.equal(safeHttpUrl("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(safeHttpUrl("https://user:pass@example.com/a"), null);
    assert.equal(safeHttpUrl(`https://example.com/${"a".repeat(MAX_URL_CHARS)}`), null);
    assert.equal(safeHttpUrl("https://example.com/\u0000a"), null);
    assert.equal(safeHttpUrl("not a url"), null);
  });

  it("degrades source status, failures, anomalies and counts without throwing", () => {
    const normalized = normalizeBoardState(board({
      generatedAt: Number.NaN,
      sourceHealth: { ok: 999, total: -1 },
      activeCount: -7,
      newCount: "many",
      refreshInProgress: "yes",
      roundStatus: "unknown",
      failures: [{ sourceId: 1, sourceName: null, error: `x`.repeat(300) }, null],
      sources: [source({ id: "", name: "bad" }), source({ lastOk: "true", lastError: 7, lastFetched: "no", lastFinalUrl: "javascript:alert(1)" })],
      anomalies: ["ok", 42, null, "line\nbreak"],
      freshness: { lastRoundAgeMs: "old", stale: 1, severe: null },
    }));
    assert.ok(normalized);
    assert.equal(normalized.generatedAt, 0);
    assert.equal(normalized.sourceHealth.ok, 1);
    assert.equal(normalized.sourceHealth.total, 1);
    assert.equal(normalized.activeCount, 1);
    assert.equal(normalized.newCount, 1);
    assert.equal(normalized.sources[0]?.activeCount, 1);
    assert.equal(normalized.refreshInProgress, false);
    assert.equal(normalized.roundStatus, null);
    assert.equal(normalized.failures.length, 1);
    assert.equal(normalized.failures[0]?.error.length, SUMMARY_MAX);
    assert.equal(normalized.sources.length, 1);
    assert.equal(normalized.sources[0]?.lastOk, null);
    assert.equal(normalized.sources[0]?.lastFetched, null);
    assert.equal(normalized.sources[0]?.lastFinalUrl, null);
    assert.deepEqual(normalized.anomalies, ["ok", "line break"]);
    assert.deepEqual(normalized.freshness, { lastRoundAgeMs: null, stale: false, severe: false });
  });

  it("removes control characters and caps display text", () => {
    assert.equal(safeDisplayText("  a\u0000b\u001fc   d  ", 10), "a b c d");
    assert.equal(safeDisplayText("x".repeat(20), 5), "xxxxx");
    assert.equal(clampText(12345, 3), "123");
    assert.equal(clampText(null, 3), "");
  });
});

describe("filter adversarial input", () => {
  it("treats a regex-looking query as literal text and tolerates malformed deals", () => {
    const deals = [
      deal({ canonicalUrl: "https://example.com/a", title: "SYNTHETIC .* 标题", publishedAt: 20 }),
      deal({ canonicalUrl: "https://example.com/b", title: "SYNTHETIC 免费", publishedAt: 10 }),
      { canonicalUrl: 42, title: 7, sourceId: null, category: {}, isNew: "yes", publishedAt: "new" },
    ] as unknown as DealDTO[];
    const filters = { query: ".*", sourceId: "all", category: "all", onlyNew: false, sort: "newest" } as unknown as Parameters<typeof filterDeals>[1];
    const personal = { claimed: "broken", favorites: null } as unknown as Parameters<typeof filterDeals>[2];
    assert.deepEqual(filterDeals(deals, filters, personal).map((item) => item.canonicalUrl), ["https://example.com/a"]);
  });

  it("sinks claimed rows and puts dated expiry first without throwing on bad timestamps", () => {
    const deals = [
      deal({ canonicalUrl: "https://example.com/a", title: "A", publishedAt: 50, expiresAt: null }),
      deal({ canonicalUrl: "https://example.com/b", title: "B", publishedAt: 10, expiresAt: 100 }),
      deal({ canonicalUrl: "https://example.com/c", title: "C", publishedAt: "bad", expiresAt: Number.NaN }),
    ] as unknown as DealDTO[];
    const filters = { query: "", sourceId: "all", category: "all", onlyNew: false, sort: "expiring" } as unknown as Parameters<typeof filterDeals>[1];
    const personal = { claimed: ["https://example.com/a"], favorites: [] } as unknown as Parameters<typeof filterDeals>[2];
    assert.deepEqual(filterDeals(deals, filters, personal).map((item) => item.canonicalUrl), [
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/a",
    ]);
  });
});
