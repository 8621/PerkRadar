import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSnapshot, writeDealSnapshot, type DealSnapshot } from "../src/lib/snapshot";
import { prepareSnapshotPublication, readPublicSnapshot } from "../src/lib/snapshot-publish";
import { runRefresh } from "../src/lib/refresh";
import type { BoardState } from "../src/lib/types";
import { EMPTY_RSS, responseFor, useMemoryDb } from "./helpers";

function syntheticBoard(): BoardState {
  return {
    generatedAt: Date.parse("2026-11-08T07:24:00.000Z"),
    lastUpdatedAt: Date.parse("2026-11-08T07:24:00.000Z"),
    lastUpdatedLabel: "2026-11-08 15:24",
    nextRefreshAt: null,
    nextRefreshLabel: null,
    sourceHealth: { ok: 1, total: 7 },
    activeCount: 1,
    newCount: 1,
    refreshInProgress: false,
    roundStatus: "partial",
    failures: [{ sourceId: "v2ex", sourceName: "V2EX推广", error: "HTTP 503" }],
    sources: [
      {
        id: "linuxdo",
        name: "LINUX DO福利羊毛",
        activeCount: 1,
        lastOk: true,
        lastError: null,
        lastFetched: 1,
        lastInserted: 1,
        lastFinalUrl: "https://r.jina.ai/https://linux.do/c/welfare/36.rss",
      },
    ],
    deals: [
      {
        id: 1,
        url: "https://linux.do/t/topic/1",
        canonicalUrl: "https://linux.do/t/topic/1",
        title: "SYNTHETIC 快照标题",
        summary: "SYNTHETIC summary must not be copied",
        category: "免费白嫖",
        sourceId: "linuxdo",
        sourceName: "LINUX DO福利羊毛",
        publishedAt: Date.parse("2026-11-08T05:36:12.000Z"),
        expiresAt: Date.parse("2026-11-12T16:00:00.000Z"),
        publishedLabel: "2026-11-08 13:36",
        expiresLabel: "2026-11-13 00:00",
        expiresSoon: false,
        isNew: true,
      },
    ],
  };
}

/** 本组使用合成公开数据，固定两小时轮次而不读取生产库。 */
function publicationSnapshot(items?: DealSnapshot["items"]): DealSnapshot {
  const board = syntheticBoard();
  board.generatedAt = Date.parse("2026-11-11T08:00:00Z");
  board.lastUpdatedAt = board.generatedAt;
  board.lastUpdatedLabel = "2026-11-11 16:00";
  const snapshot = buildSnapshot(board);
  snapshot.sources = [{ ...snapshot.sources[0]!, ok: true }];
  snapshot.sourceHealth = { ok: 1, total: 7 };
  if (items) snapshot.items = items;
  return snapshot;
}

describe("snapshot publication", () => {
  it("does not label the initial baseline as new, but detects later URLs", () => {
    const first = prepareSnapshotPublication(publicationSnapshot(), null).latest;
    assert.equal(first.baselineAvailable, false);
    assert.equal(first.newCount, 0);
    const next = publicationSnapshot([...first.items, { ...first.items[0]!, url: "https://linux.do/t/topic/2" }]);
    next.fetchedAt = "2026-11-11T10:00:00Z";
    const published = prepareSnapshotPublication(next, first).latest;
    assert.equal(published.newCount, 1);
    assert.equal(published.items.find((item) => item.url.endsWith("/2"))?.isNew, true);
  });

  it("retains failed-source and rolled-off feed items without renewing their first-seen time", () => {
    const first = publicationSnapshot();
    first.items.push({ ...first.items[0]!, sourceId: "v2ex", sourceName: "V2EX推广", url: "https://www.v2ex.com/t/1", publishedAt: null });
    const baseline = prepareSnapshotPublication(first, null).latest;
    const next = publicationSnapshot([]);
    next.fetchedAt = "2026-11-11T10:00:00Z";
    const published = prepareSnapshotPublication(next, baseline).latest;
    assert.equal(published.items.length, 2);
    assert.equal(published.items.find((item) => item.sourceId === "v2ex")?.firstSeenAt, first.fetchedAt);
    assert.equal(published.newCount, 0);
    const later = { ...next, fetchedAt: "2026-11-18T08:00:00.001Z" };
    assert.equal(prepareSnapshotPublication(later, published).latest.items.length, 0);
  });

  it("does not revive an old item when the feed omits its previously known publication time", () => {
    const previous = publicationSnapshot();
    previous.items[0] = {
      ...previous.items[0]!,
      sourceId: "v2ex",
      sourceName: "V2EX推广",
      url: "https://www.v2ex.com/t/1",
      publishedAt: "2026-11-04T09:00:00Z",
      firstSeenAt: previous.fetchedAt,
    };
    const current = publicationSnapshot([{ ...previous.items[0]!, publishedAt: null, publishedAtBeijing: null }]);
    current.fetchedAt = "2026-11-11T10:00:00Z";
    assert.equal(prepareSnapshotPublication(current, previous).latest.items.length, 0);
  });

  it("keeps the original snapshot and time on total failure and rejects a failed initial publication", () => {
    const baseline = prepareSnapshotPublication(publicationSnapshot(), null).latest;
    const failed = { ...publicationSnapshot([]), fetchedAt: "2026-11-11T10:00:00Z", sourceHealth: { ok: 0, total: 7 }, roundStatus: "failed" as const };
    const published = prepareSnapshotPublication(failed, baseline);
    assert.deepEqual(published.latest, baseline);
    assert.equal(published.status.attemptedAt, failed.fetchedAt);
    assert.equal(published.status.retainedPrevious, true);
    assert.throws(() => prepareSnapshotPublication(failed, null), /没有有效历史/);
  });

  it("removes expired entries and withdraws old Epic entries after a successful empty Epic response", () => {
    const first = publicationSnapshot();
    first.items.push({ ...first.items[0]!, sourceId: "epic", sourceName: "Epic", url: "https://store.epicgames.com/zh-CN/p/synthetic" });
    const next = publicationSnapshot([]);
    next.sources.push({ id: "epic", name: "Epic", ok: true, fetched: 0, inserted: 0, error: null, finalUrl: null });
    assert.equal(prepareSnapshotPublication(next, first).latest.items.some((item) => item.sourceId === "epic"), false);
    next.fetchedAt = "2026-11-12T16:00:00Z";
    assert.equal(prepareSnapshotPublication(next, first).latest.items.length, 0);
  });

  it("refuses damaged or offsite snapshots rather than treating them as an empty baseline", () => {
    assert.equal(readPublicSnapshot({ items: [] }), null);
    const bad = publicationSnapshot();
    bad.items[0]!.url = "https://example.com/wrong-source";
    assert.equal(readPublicSnapshot(bad), null);
    assert.throws(() => prepareSnapshotPublication(publicationSnapshot(), bad), /上一轮快照/);
  });
});

describe("public snapshot", () => {
  it("keeps SYNTHETIC titles and urls and drops private fields", () => {
    const snapshot = buildSnapshot(syntheticBoard());
    assert.equal(snapshot.schema, "daily-deals.snapshot.v1");
    assert.equal(snapshot.fetchedAt, "2026-11-08T07:24:00.000Z");
    assert.equal(snapshot.fetchedAtBeijing, "2026-11-08 15:24");
    assert.equal(snapshot.freshUntil, "2026-11-08T09:24:00.000Z");
    assert.equal(snapshot.failures[0]?.error, "HTTP 503");
    assert.equal(snapshot.items[0]?.title, "SYNTHETIC 快照标题");
    assert.equal(snapshot.items[0]?.url, "https://linux.do/t/topic/1");
    assert.equal(snapshot.items[0]?.publishedAt, "2026-11-08T05:36:12.000Z");
    assert.equal(snapshot.items[0]?.publishedAtBeijing, "2026-11-08 13:36");
    assert.equal(snapshot.items[0]?.expiresAt, "2026-11-12T16:00:00.000Z");
    assert.equal(snapshot.items[0]?.category, "免费白嫖");
    const serialized = JSON.stringify(snapshot);
    assert.equal(serialized.includes("summary"), false);
    assert.equal(serialized.includes("cookie"), false);
    assert.equal(serialized.includes("authorization"), false);
    assert.equal(serialized.includes("SYNTHETIC summary"), false);
  });

  it("writes latest.json from a completed SYNTHETIC refresh", async () => {
    useMemoryDb();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deals-snapshot-"));
    process.env.DEALS_SNAPSHOT_DIR = directory;
    try {
      await runRefresh({
        trigger: "schedule",
        now: Date.parse("2026-11-08T00:00:00.000Z"),
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("r.jina.ai")) {
            return responseFor(
              "### [SYNTHETIC 快照条目](https://linux.do/t/topic/9)\n\nSat, 07 Nov 2026 00:00:00 +0000\n",
              url,
            );
          }
          if (url.includes("v2ex.com")) throw new Error("HTTP 503");
          return responseFor(EMPTY_RSS, url);
        },
      });
      const latest = JSON.parse(fs.readFileSync(path.join(directory, "latest.json"), "utf8")) as {
        failures: { sourceId: string; error: string }[];
        items: { title: string; url: string }[];
        fetchedAt: string;
      };
      assert.equal(Number.isNaN(Date.parse(latest.fetchedAt)), false);
      assert.equal(latest.items.some((item) => item.title === "SYNTHETIC 快照条目"), true);
      assert.equal(latest.items.some((item) => item.url === "https://linux.do/t/topic/9"), true);
      assert.equal(latest.failures.some((failure) => failure.sourceId === "v2ex" && failure.error === "HTTP 503"), true);
      assert.equal(fs.readdirSync(path.join(directory, "rounds")).length, 1);
      const direct = writeDealSnapshot(syntheticBoard(), directory);
      assert.equal(direct, path.join(directory, "latest.json"));
    } finally {
      process.env.DEALS_SNAPSHOT_DIR = "off";
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
