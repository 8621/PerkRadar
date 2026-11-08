import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REFRESH_INTERVAL_MS } from "../src/lib/config";
import { getMeta } from "../src/lib/db";
import { startScheduler, stopSchedulerForTests } from "../src/lib/scheduler";
import type { BoardState } from "../src/lib/types";
import { useMemoryDb } from "./helpers";

describe("scheduler", { concurrency: false }, () => {
  it("uses a two-hour server interval and fires the supplied run once on boot", async () => {
    useMemoryDb();
    assert.equal(REFRESH_INTERVAL_MS, 7_200_000);
    let calls = 0;
    startScheduler({
      bootDelayMs: 20,
      intervalMs: 60_000,
      run: async () => {
        calls += 1;
        return {} as BoardState;
      },
    });
    startScheduler({
      bootDelayMs: 1,
      run: async () => {
        calls += 100;
        return {} as BoardState;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(calls, 1);
    assert.ok(getMeta("next_refresh_at"));
    stopSchedulerForTests();
  });
});
