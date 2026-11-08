import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSnapshot, writeDealSnapshot } from "../src/lib/snapshot";
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
