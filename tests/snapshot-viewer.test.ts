import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORAGE_KEY } from "../src/lib/personal-storage";
import { activeDeals, loadSnapshotBundle, loadViewerPersonal, nextBoundaryDelay, parseSnapshot, parseSnapshotStatus, saveViewerPersonal, selectDeals } from "../snapshot-viewer/model";

const NOW = Date.parse("2026-11-11T08:00:00Z");
const WEEK = 7 * 24 * 60 * 60 * 1000;
const iso = (at: number) => new Date(at).toISOString();
const filters = { query: "", sourceId: "all", category: "all", onlyNew: false } as const;
const personal = { claimed: [], favorites: [] };

/** 测试输入保持公开快照结构，和生产数据库完全隔离。 */
function snapshotInput(extra: Record<string, unknown> = {}) {
  return {
    schema: "daily-deals.snapshot.v1", fetchedAt: iso(NOW), freshUntil: iso(NOW + 7_200_000),
    roundStatus: "success", sourceHealth: { ok: 7, total: 7 }, failures: [],
    items: [itemInput()], ...extra,
  };
}

/** 使用真实来源域名覆盖入口验证，标题特意包含混合大小写。 */
function itemInput(extra: Record<string, unknown> = {}) {
  return { url: "https://linux.do/t/topic/1", title: "GitHub Pro 福利", sourceId: "linuxdo", sourceName: "LINUX DO", category: "免费白嫖", publishedAt: iso(NOW - 1000), expiresAt: null, isNew: true, ...extra };
}

/** 失败测试要明确指出是哪份输入没有通过外部边界。 */
function parsed(input: unknown = snapshotInput()) {
  const value = parseSnapshot(input);
  assert.ok(value, "预期公开快照可被读取");
  return value;
}

describe("snapshot viewer", () => {
  it("复用标题字面搜索、来源筛选、收藏与已领顺序", () => {
    const snapshot = parsed(snapshotInput({ items: [itemInput(), itemInput({ url: "https://www.v2ex.com/t/2", title: "github 第二条", sourceId: "v2ex" })] }));
    const saved = { claimed: [snapshot.items[0]!.canonicalUrl], favorites: [snapshot.items[1]!.canonicalUrl] };
    const shown = selectDeals(snapshot, null, { ...filters, query: "gItHuB" }, saved, NOW);
    assert.deepEqual(shown.map((item) => item.title), ["github 第二条", "GitHub Pro 福利"]);
    assert.equal(selectDeals(snapshot, null, filters, saved, NOW, true)[0]?.sourceId, "v2ex");
    assert.equal(selectDeals(snapshot, null, { ...filters, sourceId: "linuxdo", query: ".*" }, saved, NOW).length, 0);
  });

  it("默认可隐藏其他，显式查看全部时恢复且不改变数据", () => {
    const snapshot = parsed(snapshotInput({ items: [itemInput(), itemInput({ url: "https://linux.do/t/topic/3", category: "其他" })] }));
    assert.equal(selectDeals(snapshot, null, { ...filters, includeOther: false }, personal, NOW).length, 1);
    assert.equal(selectDeals(snapshot, null, { ...filters, includeOther: true }, personal, NOW).length, 2);
    assert.equal(snapshot.items.length, 2);
  });

  it("全失败保留上轮快照时不把上轮新增冒充本轮新增", () => {
    const snapshot = parsed(snapshotInput({ baselineAvailable: true }));
    const status = parseSnapshotStatus({ attemptedAt: iso(NOW + 1000), roundStatus: "failed", sourceHealth: { ok: 0, total: 7 }, failures: [], retainedPrevious: true });
    assert.ok(status);
    assert.equal(activeDeals(snapshot, null, NOW, status)[0]?.isNew, false);
    assert.equal(selectDeals(snapshot, null, { ...filters, onlyNew: true }, personal, NOW, false, status).length, 0);
    assert.equal(snapshot.items[0]?.isNew, true);
    const failedLegacy = parsed(snapshotInput({ roundStatus: "failed", sourceHealth: { ok: 0, total: 7 }, baselineAvailable: true }));
    assert.equal(activeDeals(failedLegacy, null, NOW)[0]?.isNew, false);
  });

  it("首轮和缺失旧基线均不把全部条目标成新增", () => {
    const legacy = parsed();
    assert.equal(activeDeals(legacy, null, NOW).some((item) => item.isNew), false);
    const previous = parsed(snapshotInput({ fetchedAt: iso(NOW - 7_200_000), items: [] }));
    assert.equal(activeDeals(legacy, previous, NOW)[0]?.isNew, true);
    assert.equal(activeDeals(legacy, legacy, NOW)[0]?.isNew, false);
    assert.equal(activeDeals(parsed(snapshotInput({ baselineAvailable: false })), previous, NOW)[0]?.isNew, false);
    assert.equal(activeDeals(parsed(snapshotInput({ baselineAvailable: true })), null, NOW)[0]?.isNew, true);
    assert.equal(activeDeals(parsed(snapshotInput({ baselineAvailable: true, items: [itemInput({ isNew: false })] })), previous, NOW)[0]?.isNew, false);
  });

  it("到期包含等号，七天留存在边界后一毫秒移除，无发布时间使用 firstSeenAt", () => {
    const snapshot = parsed(snapshotInput({ items: [
      itemInput({ url: "https://linux.do/t/topic/1", expiresAt: iso(NOW) }),
      itemInput({ url: "https://linux.do/t/topic/2", publishedAt: iso(NOW - WEEK) }),
      itemInput({ url: "https://linux.do/t/topic/3", publishedAt: null, firstSeenAt: iso(NOW - WEEK - 1) }),
      itemInput({ url: "https://linux.do/t/topic/4", publishedAt: null, firstSeenAt: iso(NOW - WEEK + 10) }),
    ] }));
    assert.deepEqual(activeDeals(snapshot, null, NOW).map((item) => item.id), [1, 3]);
    assert.deepEqual(activeDeals(snapshot, null, NOW + 1).map((item) => item.id), [3]);
    assert.equal(activeDeals(snapshot, null, NOW + 11).length, 0);
  });

  it("边界定时器不会让到期和新鲜度等到下一次轮询", () => {
    assert.equal(nextBoundaryDelay(parsed(snapshotInput({ freshUntil: iso(NOW + 250) })), NOW), 250);
    assert.equal(nextBoundaryDelay(parsed(snapshotInput({ items: [itemInput({ expiresAt: iso(NOW + 12) })] })), NOW), 12);
    assert.equal(nextBoundaryDelay(parsed(snapshotInput({ items: [itemInput({ publishedAt: iso(NOW - WEEK) })] })), NOW), 1);
    assert.equal(nextBoundaryDelay(null, NOW), 30_000);
  });

  it("拒绝危险协议、伪造来源、非法时间和失效快照结构", () => {
    assert.equal(parseSnapshot(snapshotInput({ items: [itemInput({ url: "javascript:alert(1)" })] })), null);
    assert.equal(parseSnapshot(snapshotInput({ items: [itemInput({ url: "https://linux.do.attacker.test/t/1" })] })), null);
    assert.equal(parseSnapshot(snapshotInput({ items: [itemInput({ expiresAt: "yesterday" })] })), null);
    assert.equal(parseSnapshot(snapshotInput({ items: {} })), null);
    assert.equal(parseSnapshot(snapshotInput({ fetchedAt: "invalid" })), null);
    assert.equal(parseSnapshot(snapshotInput({ baselineAvailable: "true" })), null);
    const safe = parsed(snapshotInput({ items: [itemInput({ title: '<img src=x onerror="alert(1)">', url: "https://linux.do/t/topic/1?utm_source=x#frag" })] }));
    assert.equal(safe.items[0]?.canonicalUrl, "https://linux.do/t/topic/1");
    assert.equal(safe.items[0]?.title, '<img src=x onerror="alert(1)">');
  });

  it("存储 getter、读取、非法 JSON 和写入失败均不阻断页内操作", () => {
    const denied = () => { throw new Error("SecurityError"); };
    assert.deepEqual(loadViewerPersonal(denied).personal, personal);
    assert.ok(loadViewerPersonal(denied).warning);
    assert.ok(loadViewerPersonal(() => ({ getItem: denied, setItem: () => {} })).warning);
    assert.deepEqual(loadViewerPersonal(() => ({ getItem: () => "not json", setItem: () => {} })).personal, personal);
    assert.ok(loadViewerPersonal(() => ({ getItem: () => "not json", setItem: () => {} })).warning);
    const changed = { claimed: ["https://linux.do/t/topic/1"], favorites: ["https://linux.do/t/topic/2"] };
    assert.equal(saveViewerPersonal(() => ({ getItem: () => null, setItem: denied }), changed), false);
    assert.equal(changed.favorites.length, 1);
    let savedKey = "", savedValue = "";
    assert.deepEqual(loadViewerPersonal(() => ({ getItem: () => JSON.stringify(changed), setItem: () => {} })).personal, changed);
    assert.equal(saveViewerPersonal(() => ({ getItem: () => null, setItem: (key, value) => { savedKey = key; savedValue = value; } }), changed), true);
    assert.equal(savedKey, STORAGE_KEY);
    assert.deepEqual(JSON.parse(savedValue), changed);
  });

  it("三个快照并行读取，previous 失败或畸形时不产生虚假的新增", async () => {
    const requested: string[] = [];
    const pending = new Map<string, (value: Response) => void>();
    const fetcher: typeof fetch = async (input, options) => {
      const name = String(input);
      requested.push(name);
      assert.equal(options?.cache, "no-store");
      return new Promise<Response>((resolve) => pending.set(name, resolve));
    };
    const loading = loadSnapshotBundle(fetcher);
    assert.deepEqual(requested, ["latest.json", "previous.json", "status.json"]);
    pending.get("latest.json")!(Response.json(snapshotInput()));
    pending.get("previous.json")!(new Response("not found", { status: 404 }));
    pending.get("status.json")!(new Response("missing", { status: 404 }));
    const result = await loading;
    assert.equal(result.previous, null);
    assert.equal(result.status, null);
    assert.equal(selectDeals(result.latest, result.previous, { ...filters, onlyNew: true }, personal, NOW).length, 0);
    const invalidPrevious = await loadSnapshotBundle(async (input) => Response.json(String(input) === "latest.json" ? snapshotInput() : { items: [] }));
    assert.equal(invalidPrevious.previous, null);
  });

  it("最近全失败状态不会覆盖最后正常抓取时间；首轮无 latest 仍传递失败详情", async () => {
    const statusInput = { attemptedAt: iso(NOW + 7_200_000), roundStatus: "failed", sourceHealth: { ok: 0, total: 7 }, failures: [{ sourceId: "v2ex", sourceName: "V2EX", error: "HTTP 503" }], retainedPrevious: true };
    const result = await loadSnapshotBundle(async (input) => Response.json(String(input) === "latest.json" ? snapshotInput() : String(input) === "status.json" ? statusInput : {}));
    assert.equal(result.latest.fetchedAt, NOW);
    assert.equal(result.status?.attemptedAt, NOW + 7_200_000);
    assert.equal(result.status?.roundStatus, "failed");
    assert.equal(result.status?.failures[0]?.error, "HTTP 503");
    assert.equal(parseSnapshotStatus({ ...statusInput, attemptedAt: "bad" }), null);
    await assert.rejects(loadSnapshotBundle(async (input) => String(input) === "status.json" ? Response.json(statusInput) : new Response("missing", { status: 404 })), (error: unknown) => {
      assert.ok(error instanceof Error && "status" in error);
      assert.equal((error.status as { roundStatus: string }).roundStatus, "failed");
      return true;
    });
    await assert.rejects(loadSnapshotBundle(async () => Response.json({})), /不是有效的公开快照/);
  });
});
