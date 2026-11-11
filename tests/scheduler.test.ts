import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { REFRESH_INTERVAL_MS, SCHEDULER_FAILED_RETRY_MS } from "../src/lib/config";
import { acquireLease, getDb, getMeta, releaseLease } from "../src/lib/db";
import { startScheduler, stopSchedulerForTests } from "../src/lib/scheduler";
import type { BoardState } from "../src/lib/types";
import { useMemoryDb } from "./helpers";

const board = (roundStatus: BoardState["roundStatus"] = "success") => ({ roundStatus }) as BoardState;
/** Let the promise chain behind a mocked timer callback settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}
function leaseOwner(): string | undefined {
  const row = getDb().prepare("SELECT owner FROM leases WHERE name = 'scheduler'").get();
  return row ? String(row.owner) : undefined;
}

describe("scheduler", { concurrency: false }, () => {
  afterEach(() => {
    stopSchedulerForTests();
    mock.timers.reset();
  });

  it("uses a two-hour server interval and fires the supplied run once on boot", async () => {
    useMemoryDb();
    assert.equal(REFRESH_INTERVAL_MS, 7_200_000);
    let calls = 0;
    startScheduler({
      bootDelayMs: 20,
      intervalMs: 60_000,
      run: async () => {
        calls += 1;
        return board();
      },
    });
    startScheduler({
      bootDelayMs: 1,
      run: async () => {
        calls += 100;
        return board();
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(calls, 1);
    assert.ok(getMeta("next_refresh_at"));
  });

  it("boots while a killed predecessor still holds the lease, then takes over when it expires", async () => {
    useMemoryDb();
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.parse("2026-11-11T00:00:00Z") });
    acquireLease("scheduler", "killed-predecessor", Date.now(), 90_000);
    let calls = 0;
    assert.doesNotThrow(() => startScheduler({ bootDelayMs: 1_000, run: async () => { calls += 1; return board(); } }));
    mock.timers.tick(60_000);
    await settle();
    assert.equal(calls, 0, "must not fetch while another owner's lease is live");
    assert.equal(leaseOwner(), "killed-predecessor");
    mock.timers.tick(40_000);
    await settle();
    assert.equal(calls, 1, "takes over once the stale lease has expired");
    assert.notEqual(leaseOwner(), "killed-predecessor");
  });

  it("runs one catch-up round after sleeping past the lease and the interval", async () => {
    useMemoryDb();
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.parse("2026-11-11T00:00:00Z") });
    let calls = 0;
    startScheduler({ bootDelayMs: 1_000, run: async () => { calls += 1; return board(); } });
    mock.timers.tick(1_000);
    await settle();
    assert.equal(calls, 1);
    // The machine sleeps: the wall clock jumps five hours while no timer fires.
    mock.timers.setTime(Date.now() + 5 * 60 * 60 * 1000);
    mock.timers.tick(20_000);
    await settle();
    assert.equal(calls, 2, "one catch-up round on wake, not one per missed slot");
    mock.timers.tick(60 * 60 * 1000);
    await settle();
    assert.equal(calls, 2);
    mock.timers.tick(60 * 60 * 1000);
    await settle();
    assert.equal(calls, 3, "regular interval resumes after the catch-up");
  });

  it("retries sooner after a round where every source failed, and stays idle beside a live owner", async () => {
    useMemoryDb();
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.parse("2026-11-11T00:00:00Z") });
    let calls = 0;
    startScheduler({ bootDelayMs: 1_000, run: async () => { calls += 1; return board(calls === 1 ? "failed" : "success"); } });
    mock.timers.tick(1_000);
    await settle();
    assert.equal(calls, 1);
    assert.ok(Number(getMeta("next_refresh_at")) <= Date.now() + SCHEDULER_FAILED_RETRY_MS);
    mock.timers.tick(SCHEDULER_FAILED_RETRY_MS);
    await settle();
    assert.equal(calls, 2);

    // Another live instance now owns the lease and keeps renewing it.
    stopSchedulerForTests();
    acquireLease("scheduler", "other-instance", Date.now(), 90_000);
    let idle = 0;
    startScheduler({ bootDelayMs: 1_000, run: async () => { idle += 1; return board(); } });
    for (let i = 0; i < 12; i += 1) {
      acquireLease("scheduler", "other-instance", Date.now(), 90_000);
      mock.timers.tick(20_000);
      await settle();
    }
    assert.equal(idle, 0);
    releaseLease("scheduler", "other-instance");
    mock.timers.tick(20_000);
    await settle();
    assert.equal(idle, 1);
  });
});
