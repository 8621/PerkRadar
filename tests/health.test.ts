import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBoardState } from "../src/lib/board";
import { finishRound, insertRound, insertSourceRun } from "../src/lib/db";
import { toHealthReport } from "../src/lib/health";
import type { BoardState } from "../src/lib/types";
import { useMemoryDb } from "./helpers";

// 这些测试直接构造轮次历史，验证健康接口的告警聚合，而不是重复跑网络抓取。
// 这样可以稳定覆盖连续失败、条数骤降和解析结构错误，并确认恢复后状态会清零。
describe("health report", () => {
  it("reports source success and failure without deal bodies", () => {
    const board = {
      generatedAt: Date.parse("2026-11-08T07:24:00.000Z"),
      lastUpdatedAt: Date.parse("2026-11-08T07:24:00.000Z"),
      lastUpdatedLabel: "2026-11-08 15:24",
      nextRefreshAt: Date.parse("2026-11-08T09:24:00.000Z"),
      nextRefreshLabel: "2026-11-08 17:24",
      sourceHealth: { ok: 6, total: 7 },
      activeCount: 2,
      newCount: 1,
      refreshInProgress: false,
      roundStatus: "partial",
      failures: [{ sourceId: "v2ex", sourceName: "V2EX推广", error: "HTTP 503" }],
      sources: [],
      deals: [
        {
          id: 1,
          url: "https://example.com/synthetic",
          canonicalUrl: "https://example.com/synthetic",
          title: "SYNTHETIC should not appear in health",
          summary: "secret-looking summary",
          category: "其他",
          sourceId: "linuxdo",
          sourceName: "LINUX DO福利羊毛",
          publishedAt: null,
          expiresAt: null,
          publishedLabel: null,
          expiresLabel: null,
          expiresSoon: false,
          isNew: true,
        },
      ],
    } satisfies BoardState;
    const report = toHealthReport(board);
    assert.equal(report.ok, true);
    assert.equal(report.fetchedAt, "2026-11-08T07:24:00.000Z");
    assert.equal(report.fetchedAtBeijing, "2026-11-08 15:24");
    assert.deepEqual(report.sourceHealth, { ok: 6, total: 7 });
    assert.equal(report.failures[0]?.error, "HTTP 503");
    assert.equal(report.nextRefreshAt, "2026-11-08T09:24:00.000Z");
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes("SYNTHETIC"), false);
    assert.equal(serialized.includes("summary"), false);
    assert.equal(serialized.includes("secret-looking"), false);
  });

  it("warns after three consecutive source failures and clears after recovery", () => {
    useMemoryDb();
    const base = Date.parse("2026-11-08T00:00:00.000Z");
    for (let index = 0; index < 3; index += 1) {
      const startedAt = base + index * 1000;
      const roundId = insertRound("schedule", startedAt);
      insertSourceRun({
        roundId,
        sourceId: "v2ex",
        ok: false,
        fetchedCount: 0,
        insertedCount: 0,
        error: "HTTP 503",
        finalUrl: null,
        startedAt,
        finishedAt: startedAt + 1,
      });
      finishRound(roundId, startedAt + 1, "partial");
    }
    const failed = getBoardState(base + 3000);
    const source = failed.sources.find((item) => item.id === "v2ex");
    assert.equal(source?.quality?.consecutiveFailures, 3);
    assert.match(source?.quality?.warning ?? "", /连续失败 3 轮/);
    assert.ok((failed.anomalies ?? []).some((item) => item.includes("V2EX推广") && item.includes("连续失败 3 轮")));

    const recoveredRound = insertRound("schedule", base + 4000);
    insertSourceRun({
      roundId: recoveredRound,
      sourceId: "v2ex",
      ok: true,
      fetchedCount: 2,
      insertedCount: 0,
      error: null,
      finalUrl: "https://www.v2ex.com/feed/promotions.xml",
      startedAt: base + 4000,
      finishedAt: base + 4001,
    });
    finishRound(recoveredRound, base + 4001, "partial");
    const recovered = getBoardState(base + 5000);
    assert.equal(recovered.sources.find((item) => item.id === "v2ex")?.quality?.consecutiveFailures, 0);
    assert.equal((recovered.anomalies ?? []).some((item) => item.includes("V2EX推广") && item.includes("连续失败")), false);
  });

  it("flags a source count drop and parser structure failure without exposing response content", () => {
    useMemoryDb();
    const base = Date.parse("2026-11-08T00:00:00.000Z");
    const firstRound = insertRound("schedule", base);
    insertSourceRun({
      roundId: firstRound,
      sourceId: "appinn",
      ok: true,
      fetchedCount: 10,
      insertedCount: 10,
      error: null,
      finalUrl: "https://www.appinn.com/feed/",
      startedAt: base,
      finishedAt: base + 1,
    });
    finishRound(firstRound, base + 1, "partial");

    const droppedRound = insertRound("schedule", base + 1000);
    insertSourceRun({
      roundId: droppedRound,
      sourceId: "appinn",
      ok: true,
      fetchedCount: 5,
      insertedCount: 0,
      error: null,
      finalUrl: "https://www.appinn.com/feed/",
      startedAt: base + 1000,
      finishedAt: base + 1001,
    });
    finishRound(droppedRound, base + 1001, "partial");
    const dropped = getBoardState(base + 2000);
    const countQuality = dropped.sources.find((item) => item.id === "appinn")?.quality;
    assert.equal(countQuality?.countDrop, true);
    assert.match(countQuality?.warning ?? "", /解析条数骤降至 5/);
    assert.ok((dropped.anomalies ?? []).some((item) => item.includes("小众软件") && item.includes("从 10 降到 5")));

    const brokenRound = insertRound("schedule", base + 2000);
    insertSourceRun({
      roundId: brokenRound,
      sourceId: "appinn",
      ok: false,
      fetchedCount: 0,
      insertedCount: 0,
      error: "未能解析 RSS/Atom",
      finalUrl: null,
      startedAt: base + 2000,
      finishedAt: base + 2001,
    });
    insertSourceRun({
      roundId: brokenRound,
      sourceId: "linuxdo",
      ok: false,
      fetchedCount: 0,
      insertedCount: 0,
      error: "返回内容不是 LINUX DO 福利列表，可能被阻断",
      finalUrl: null,
      startedAt: base + 2000,
      finishedAt: base + 2001,
    });
    finishRound(brokenRound, base + 2001, "partial");
    const broken = getBoardState(base + 3000);
    const structureQuality = broken.sources.find((item) => item.id === "appinn")?.quality;
    assert.equal(structureQuality?.countDrop, false);
    assert.equal(structureQuality?.structureAnomaly, true);
    assert.match(structureQuality?.warning ?? "", /解析结构异常/);
    assert.ok((broken.anomalies ?? []).some((item) => item.includes("小众软件") && item.includes("解析结构异常")));
    assert.equal(broken.sources.find((item) => item.id === "linuxdo")?.quality?.structureAnomaly, true);

    const linuxdoBrokenRound = insertRound("schedule", base + 3000);
    insertSourceRun({
      roundId: linuxdoBrokenRound,
      sourceId: "linuxdo",
      ok: false,
      fetchedCount: 0,
      insertedCount: 0,
      error: "未能从 Markdown 解析出条目",
      finalUrl: null,
      startedAt: base + 3000,
      finishedAt: base + 3001,
    });
    finishRound(linuxdoBrokenRound, base + 3001, "partial");
    assert.equal(getBoardState(base + 4000).sources.find((item) => item.id === "linuxdo")?.quality?.structureAnomaly, true);
  });
});
