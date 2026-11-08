import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { parseLinuxDoMarkdown } from "../src/lib/parse/linuxdo";
import { linuxdoItem } from "./helpers";

const sample = fs.readFileSync(new URL("./fixtures/linuxdo-public-sample.md", import.meta.url), "utf8");

describe("linux.do Jina markdown", () => {
  it("parses title, topic link, and RFC822 date from the captured public sample", () => {
    const items = parseLinuxDoMarkdown(sample);
    assert.ok(items.length >= 20);
    assert.equal(items[0]?.title, "给支付宝阿宝发“免费送我一度电” 获取生活缴费红包，【不一定有】");
    assert.equal(items[0]?.url, "https://linux.do/t/topic/3139754");
    assert.equal(items[0]?.summary, "");
    assert.equal(items[0]?.publishedAt, Date.parse("Sun, 08 Nov 2026 05:36:12 +0000"));
    assert.equal(items[0]?.expiresAt, null);
    assert.ok(items.every((item) => item.summary === ""));
  });

  it("parses the documented third-line date shape", () => {
    const markdown = linuxdoItem("SYNTHETIC 免费领取", 1, "Sat, 07 Nov 2026 23:08:31 +0000");
    const [item] = parseLinuxDoMarkdown(markdown);
    assert.equal(item?.title, "SYNTHETIC 免费领取");
    assert.equal(item?.publishedAt, Date.parse("Sat, 07 Nov 2026 23:08:31 +0000"));
    assert.equal(item?.summary, "");
  });

  it("fails honestly when the body is not the welfare list", () => {
    assert.throws(() => parseLinuxDoMarkdown("SYNTHETIC challenge page"), /阻断|解析/);
  });
});
