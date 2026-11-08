import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBeijing } from "../src/lib/time";

describe("Beijing time", () => {
  it("renders Epic UTC 16:00 as the next calendar day 00:00 in Asia/Shanghai", () => {
    assert.equal(formatBeijing(Date.parse("2026-11-12T16:00:00.000Z")), "2026-11-13 00:00");
  });

  it("renders a linux.do RFC822 instant in Beijing time", () => {
    assert.equal(formatBeijing(Date.parse("Sun, 08 Nov 2026 05:36:12 +0000")), "2026-11-08 13:36");
  });
});
