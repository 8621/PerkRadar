import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SOURCE_DEFS } from "../src/lib/source-defs";
import {
  assertSameOrigin,
  assertSmallBody,
  consumeManualAttempt,
  resetGuards,
  GuardError,
} from "../src/lib/guard";
import { REFRESH_INTERVAL_MS } from "../src/lib/config";

describe("guards and source URLs", () => {
  it("uses the required source URLs", () => {
    const byId = Object.fromEntries(SOURCE_DEFS.map((source) => [source.id, source.url]));
    assert.equal(byId.linuxdo, "https://r.jina.ai/https://linux.do/c/welfare/36.rss");
    assert.equal(byId.v2ex, "https://www.v2ex.com/feed/promotions.xml");
    assert.equal(byId.iplaysoft, "https://www.iplaysoft.com/feed");
    assert.equal(SOURCE_DEFS.length, 7);
    assert.equal(
      SOURCE_DEFS.some((source) => source.url.endsWith("/feed/promotion.xml")),
      false,
    );
    assert.equal(REFRESH_INTERVAL_MS, 2 * 60 * 60 * 1000);
  });

  it("limits manual attempts and rejects cross-site refresh", () => {
    resetGuards();
    for (let i = 0; i < 8; i += 1) assert.equal(consumeManualAttempt("10.0.0.8", 1_000 + i), true);
    assert.equal(consumeManualAttempt("10.0.0.8", 2_000), false);
    assert.equal(consumeManualAttempt("10.0.0.9", 2_000), true);

    const headers = new Headers({ origin: "https://evil.example", host: "deals.example" });
    assert.throws(() => assertSameOrigin(headers), GuardError);
    assert.doesNotThrow(() => assertSameOrigin(new Headers({ host: "deals.example" })));
    assert.throws(
      () => assertSmallBody(new Headers({ "content-length": "99999" })),
      GuardError,
    );
  });
});
