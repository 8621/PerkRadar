import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { describe, it } from "node:test";
import { fetchText } from "../src/lib/http";
import { parseFeed } from "../src/lib/parse/feed";
import { canonicalUrl } from "../src/lib/url";
import { EMPTY_RSS } from "./helpers";

function readFixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("RSS and Atom", () => {
  it("parses the captured V2EX Atom entry and strips the reply hash via canonical URL", () => {
    const [item] = parseFeed(readFixture("v2ex-public-sample.xml"));
    assert.equal(item?.title, "Anthropic 原生接口直通，新人入群送 10 美元");
    assert.equal(item?.url, "https://www.v2ex.com/t/1255325#reply0");
    assert.equal(canonicalUrl(item!.url), "https://www.v2ex.com/t/1255325");
    assert.equal(item?.publishedAt, Date.parse("2026-11-08T05:08:49Z"));
    assert.ok(item!.summary.length > 0);
  });

  it("decodes the captured 小众软件 RSS title instead of treating it as a deal keyword", () => {
    const [item] = parseFeed(readFixture("appinn-public-sample.xml"));
    assert.match(item!.title, /TotK Recomp/);
    assert.match(item!.title, /塞尔达传说/);
    assert.equal(item?.url, "https://www.appinn.com/totk-recomp/");
    assert.doesNotMatch(item!.title, /&#\d+;/);
  });

  it("keeps the captured 异次元 title and link", () => {
    const [item] = parseFeed(readFixture("iplaysoft-public-sample.xml"));
    assert.match(item!.title, /夸克网盘/);
    assert.equal(item?.url, "https://www.iplaysoft.com/p/quark-svip");
  });

  it("accepts a SYNTHETIC empty channel as zero items", () => {
    assert.deepEqual(parseFeed(EMPTY_RSS), []);
  });

  it("rejects a SYNTHETIC HTML challenge page", () => {
    assert.throws(() => parseFeed("<!doctype html><html><title>challenge</title></html>"), /网页|阻断/);
  });

  it("follows a 301 to the feed body", async () => {
    const server = http.createServer((req, res) => {
      if (req.url === "/old") {
        res.writeHead(301, { Location: "/new" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(EMPTY_RSS);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    try {
      const fetched = await fetchText(`http://127.0.0.1:${address.port}/old`, {
        fetchImpl: fetch,
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(fetched.status, 200);
      assert.match(fetched.finalUrl, /\/new$/);
      assert.equal(parseFeed(fetched.body).length, 0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
