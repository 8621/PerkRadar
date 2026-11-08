import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toHealthReport } from "../src/lib/health";
import type { BoardState } from "../src/lib/types";

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
});
