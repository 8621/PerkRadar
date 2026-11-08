import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RETENTION_MS } from "../src/lib/config";
import { isExpiringSoon, isStale } from "../src/lib/retention";
import { canonicalUrl } from "../src/lib/url";

const NOW = Date.parse("2026-11-08T00:00:00.000Z");

describe("retention and canonical URLs", () => {
  it("keeps an item published exactly 7 days ago and drops one millisecond older", () => {
    const exactly = { publishedAt: NOW - RETENTION_MS, firstSeenAt: NOW, expiresAt: null };
    const older = { publishedAt: NOW - RETENTION_MS - 1, firstSeenAt: NOW, expiresAt: null };
    assert.equal(isStale(exactly, NOW), false);
    assert.equal(isStale(older, NOW), true);
  });

  it("drops an item at the expiry instant and keeps one millisecond later", () => {
    assert.equal(
      isStale({ publishedAt: NOW, firstSeenAt: NOW, expiresAt: NOW }, NOW),
      true,
    );
    assert.equal(
      isStale({ publishedAt: NOW, firstSeenAt: NOW, expiresAt: NOW + 1 }, NOW),
      false,
    );
  });

  it("uses first-seen time when the source has no publish date", () => {
    assert.equal(isStale({ publishedAt: null, firstSeenAt: NOW - RETENTION_MS, expiresAt: null }, NOW), false);
    assert.equal(
      isStale({ publishedAt: null, firstSeenAt: NOW - RETENTION_MS - 1, expiresAt: null }, NOW),
      true,
    );
  });

  it("marks the last 48 hours before expiry as soon", () => {
    assert.equal(isExpiringSoon(NOW + 48 * 60 * 60 * 1000, NOW), true);
    assert.equal(isExpiringSoon(NOW + 48 * 60 * 60 * 1000 + 1, NOW), false);
    assert.equal(isExpiringSoon(NOW, NOW), false);
  });

  it("dedupes tracking params, hash, host case, and trailing slash", () => {
    assert.equal(
      canonicalUrl("HTTPS://WWW.V2EX.COM/t/1255325/?utm_source=rss&ref=1#reply0"),
      "https://www.v2ex.com/t/1255325",
    );
  });
});
