import { REFRESH_INTERVAL_MS, SCHEDULER_BOOT_DELAY_MS } from "./config";
import { setMeta } from "./db";
import { RefreshRejected, runRefresh, type RefreshOptions } from "./refresh";
import type { BoardState } from "./types";

type SchedulerGlobal = typeof globalThis & {
  __dealsSchedulerOn?: boolean;
  __dealsScheduler?: ReturnType<typeof setInterval>;
  __dealsBoot?: ReturnType<typeof setTimeout>;
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
      console.log("[deals] scheduled refresh skipped because another round is running");
      return;
    }
    console.error("[deals] scheduled refresh failed", error);
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
  g.__dealsSchedulerOn = true;
  const run = options?.run ?? runRefresh;
  const skipBoot = process.env.DEALS_SKIP_BOOT === "1" && options?.bootDelayMs == null;
  const bootDelayMs = options?.bootDelayMs ?? SCHEDULER_BOOT_DELAY_MS;
  const intervalMs = options?.intervalMs ?? REFRESH_INTERVAL_MS;

  const arm = () => {
    g.__dealsScheduler = setInterval(() => {
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
    void runScheduled(run).finally(arm);
  }, bootDelayMs);
  g.__dealsBoot.unref?.();
  setMeta("next_refresh_at", String(Date.now() + bootDelayMs));
}

export function stopSchedulerForTests(): void {
  const g = globals();
  if (g.__dealsBoot) clearTimeout(g.__dealsBoot);
  if (g.__dealsScheduler) clearInterval(g.__dealsScheduler);
  g.__dealsBoot = undefined;
  g.__dealsScheduler = undefined;
  g.__dealsSchedulerOn = false;
}
