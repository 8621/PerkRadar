import { REFRESH_INTERVAL_MS, SCHEDULER_BOOT_DELAY_MS } from "./config";
import { randomUUID } from "node:crypto";
import { acquireLease, latestFinishedRound, releaseLease, renewLease, setMeta } from "./db";
import { logEvent, logFailure } from "./log";
import { RefreshRejected, runRefresh, type RefreshOptions } from "./refresh";
import type { BoardState } from "./types";

type SchedulerGlobal = typeof globalThis & {
  __dealsSchedulerOn?: boolean;
  __dealsScheduler?: ReturnType<typeof setInterval>;
  __dealsBoot?: ReturnType<typeof setTimeout>;
  __dealsHeartbeat?: ReturnType<typeof setInterval>;
  __dealsLeaseOwner?: string;
};

function globals(): SchedulerGlobal {
  return globalThis as SchedulerGlobal;
}

export function shouldStartScheduler(): boolean {
  if (process.env.DISABLE_SCHEDULER === "1") return false;
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  if (process.env.npm_lifecycle_event === "build") return false;
  return true;
}

async function runScheduled(run: (options: RefreshOptions) => Promise<BoardState>): Promise<void> {
  try {
    await run({ trigger: "schedule" });
  } catch (error) {
    if (error instanceof RefreshRejected && error.code === "BUSY") {
      logEvent("scheduled_refresh_skipped", { reason: "busy" });
      return;
    }
    logFailure("scheduled_refresh_failed", error);
  }
}

/**
 * In-process scheduler for one long-running Node server.
 * The first round starts shortly after boot, then every two hours.
 * Dev hot reload is guarded with globalThis so the interval is not duplicated.
 */
export function startScheduler(options?: {
  run?: (options: RefreshOptions) => Promise<BoardState>;
  bootDelayMs?: number;
  intervalMs?: number;
}): void {
  if (!shouldStartScheduler()) return;
  const g = globals();
  if (g.__dealsSchedulerOn) return;
  const owner = randomUUID();
  if (!acquireLease("scheduler", owner, Date.now(), 90_000)) throw new Error("另一个 PerkRadar 实例正在运行；请保持单实例");
  g.__dealsLeaseOwner = owner;
  g.__dealsHeartbeat = setInterval(() => {
    try {
      if (!renewLease("scheduler", owner, Date.now(), 90_000)) throw new Error("调度租约失效");
    } catch (error) { logFailure("scheduler_lease_lost", error); stopSchedulerForTests(); }
  }, 20_000);
  g.__dealsHeartbeat.unref?.();
  g.__dealsSchedulerOn = true;
  const run = options?.run ?? runRefresh;
  const skipBoot = process.env.DEALS_SKIP_BOOT === "1" && options?.bootDelayMs == null;
  const last = latestFinishedRound()?.startedAt;
  const remaining = last == null ? 0 : Math.max(0, REFRESH_INTERVAL_MS - (Date.now() - last));
  const bootDelayMs = options?.bootDelayMs ?? Math.max(SCHEDULER_BOOT_DELAY_MS, remaining);
  const intervalMs = options?.intervalMs ?? REFRESH_INTERVAL_MS;

  const ownsLease = () => renewLease("scheduler", owner, Date.now(), 90_000);
  const arm = () => {
    g.__dealsScheduler = setInterval(() => {
      if (!ownsLease()) { stopSchedulerForTests(); return; }
      const nextAt = Date.now() + intervalMs;
      setMeta("next_refresh_at", String(nextAt));
      void runScheduled(run);
    }, intervalMs);
    g.__dealsScheduler.unref?.();
    setMeta("next_refresh_at", String(Date.now() + intervalMs));
  };

  if (skipBoot) {
    arm();
    return;
  }
  g.__dealsBoot = setTimeout(() => {
    if (!ownsLease()) { stopSchedulerForTests(); return; }
    if (g.__dealsSchedulerOn) void runScheduled(run).finally(() => { if (g.__dealsSchedulerOn) arm(); });
  }, bootDelayMs);
  g.__dealsBoot.unref?.();
  setMeta("next_refresh_at", String(Date.now() + bootDelayMs));
}

export function stopSchedulerForTests(): void {
  const g = globals();
  if (g.__dealsHeartbeat) clearInterval(g.__dealsHeartbeat);
  if (g.__dealsLeaseOwner) { try { releaseLease("scheduler", g.__dealsLeaseOwner); } catch { /* unavailable DB: lease expires naturally */ } }
  g.__dealsHeartbeat = undefined;
  g.__dealsLeaseOwner = undefined;
  if (g.__dealsBoot) clearTimeout(g.__dealsBoot);
  if (g.__dealsScheduler) clearInterval(g.__dealsScheduler);
  g.__dealsBoot = undefined;
  g.__dealsScheduler = undefined;
  g.__dealsSchedulerOn = false;
}
