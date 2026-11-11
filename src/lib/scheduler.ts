import { randomUUID } from "node:crypto";
import {
  REFRESH_INTERVAL_MS,
  SCHEDULER_BOOT_DELAY_MS,
  SCHEDULER_BUSY_RETRY_MS,
  SCHEDULER_FAILED_RETRY_MS,
  SCHEDULER_LEASE_TTL_MS,
  SCHEDULER_TICK_MS,
} from "./config";
import { acquireLease, latestFinishedRound, releaseLease, setMeta } from "./db";
import { logEvent, logFailure } from "./log";
import { RefreshRejected, runRefresh, type RefreshOptions } from "./refresh";
import type { BoardState } from "./types";

type SchedulerGlobal = typeof globalThis & {
  __dealsSchedulerOn?: boolean;
  __dealsTick?: ReturnType<typeof setTimeout>;
  __dealsLeaseOwner?: string;
  __dealsExitHook?: boolean;
};

type Outcome = "ok" | "failed" | "busy" | "error";

function globals(): SchedulerGlobal {
  return globalThis as SchedulerGlobal;
}

export function shouldStartScheduler(): boolean {
  if (process.env.DISABLE_SCHEDULER === "1") return false;
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  if (process.env.npm_lifecycle_event === "build") return false;
  return true;
}

async function runScheduled(run: (options: RefreshOptions) => Promise<BoardState>): Promise<Outcome> {
  try {
    const board = await run({ trigger: "schedule" });
    return board?.roundStatus === "failed" ? "failed" : "ok";
  } catch (error) {
    if (error instanceof RefreshRejected && error.code === "BUSY") {
      logEvent("scheduled_refresh_skipped", { reason: "busy" });
      return "busy";
    }
    logFailure("scheduled_refresh_failed", error);
    return "error";
  }
}

/** Best-effort: a lease left behind by a killed process simply expires after its TTL. */
function releaseOwnLease(): void {
  const owner = globals().__dealsLeaseOwner;
  if (!owner) return;
  try {
    releaseLease("scheduler", owner);
  } catch {
    // Database already closed or unreadable.
  }
}

/**
 * In-process scheduler for one long-running Node server.
 *
 * A short tick compares the wall clock with the due time instead of trusting one long
 * timer, so a machine that slept through a slot runs one catch-up round on wake rather
 * than waiting out the rest of a stale interval. Missed slots are not replayed.
 *
 * The SQLite lease only decides which process may run scheduled rounds. Losing it (sleep
 * longer than the TTL, a paused container) or finding it held at boot (the previous
 * process was killed without releasing it) is never fatal: the tick keeps trying and
 * resumes as soon as the lease is free. A second live instance therefore stays idle
 * instead of fetching in parallel.
 *
 * After a round where every source failed, or a run that threw, the next attempt comes
 * sooner with a doubling delay capped at the normal interval; a typical cause is the
 * network not being up yet right after wake.
 */
export function startScheduler(options?: {
  run?: (options: RefreshOptions) => Promise<BoardState>;
  bootDelayMs?: number;
  intervalMs?: number;
  tickMs?: number;
  leaseTtlMs?: number;
}): void {
  if (!shouldStartScheduler()) return;
  const g = globals();
  if (g.__dealsSchedulerOn) return;
  const owner = randomUUID();
  g.__dealsSchedulerOn = true;
  g.__dealsLeaseOwner = owner;
  if (!g.__dealsExitHook) {
    g.__dealsExitHook = true;
    process.once("exit", releaseOwnLease);
  }

  const run = options?.run ?? runRefresh;
  const intervalMs = options?.intervalMs ?? REFRESH_INTERVAL_MS;
  const tickMs = options?.tickMs ?? SCHEDULER_TICK_MS;
  const leaseTtlMs = options?.leaseTtlMs ?? SCHEDULER_LEASE_TTL_MS;
  const active = () => g.__dealsSchedulerOn === true && g.__dealsLeaseOwner === owner;

  let dueAt: number;
  if (options?.bootDelayMs != null) {
    dueAt = Date.now() + options.bootDelayMs;
  } else if (process.env.DEALS_SKIP_BOOT === "1") {
    dueAt = Date.now() + intervalMs;
  } else {
    const last = latestFinishedRound()?.startedAt;
    const remaining = last == null ? 0 : Math.max(0, intervalMs - (Date.now() - last));
    dueAt = Date.now() + Math.max(SCHEDULER_BOOT_DELAY_MS, remaining);
  }

  let held: boolean | null = null;
  let running = false;
  let failureStreak = 0;

  const publishDue = () => {
    try {
      setMeta("next_refresh_at", String(dueAt));
    } catch (error) {
      logFailure("scheduler_meta_failed", error);
    }
  };

  /** Renews our own lease or takes over an expired one; false while another owner is live. */
  const holdLease = (): boolean => {
    let now: boolean;
    try {
      now = acquireLease("scheduler", owner, Date.now(), leaseTtlMs);
    } catch (error) {
      logFailure("scheduler_lease_error", error);
      now = false;
    }
    if (now !== held) {
      logEvent(now ? "scheduler_lease_acquired" : "scheduler_lease_waiting", { recovered: held === false });
      // The due time is only ours to publish while we are the instance that will act on it.
      if (now) publishDue();
    }
    held = now;
    return now;
  };

  const schedule = () => {
    if (!active()) return;
    const untilDue = held && !running ? Math.max(0, dueAt - Date.now()) : tickMs;
    g.__dealsTick = setTimeout(tick, Math.min(tickMs, untilDue));
    g.__dealsTick.unref?.();
  };

  const tick = () => {
    if (!active()) return;
    if (holdLease() && !running && Date.now() >= dueAt) {
      running = true;
      dueAt = Date.now() + intervalMs;
      publishDue();
      void runScheduled(run)
        .then((outcome) => {
          if (!active()) return;
          if (outcome === "ok") {
            failureStreak = 0;
            return;
          }
          // The slot was not used (busy) or produced nothing (failed/error): come back sooner.
          const retryMs =
            outcome === "busy"
              ? SCHEDULER_BUSY_RETRY_MS
              : Math.min(intervalMs, SCHEDULER_FAILED_RETRY_MS * 2 ** failureStreak++);
          dueAt = Math.min(dueAt, Date.now() + retryMs);
          publishDue();
          logEvent("scheduled_refresh_retry", { outcome, retryInMs: retryMs });
        })
        .finally(() => {
          running = false;
          if (!active()) return;
          clearTimeout(g.__dealsTick);
          schedule();
        });
    }
    schedule();
  };

  holdLease();
  schedule();
}

export function stopSchedulerForTests(): void {
  const g = globals();
  if (g.__dealsTick) clearTimeout(g.__dealsTick);
  releaseOwnLease();
  g.__dealsTick = undefined;
  g.__dealsLeaseOwner = undefined;
  g.__dealsSchedulerOn = false;
}
