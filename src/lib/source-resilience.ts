import { setTimeout as delay } from "node:timers/promises";
import { HttpError } from "./http";
type Circuit = { failures: number; openUntil: number };
const circuits = new Map<string, Circuit>();
export function resetCircuitsForTests(): void { circuits.clear(); }
/** Retries are bounded by both count and the caller's AbortSignal. Never shorten Retry-After. */
export async function resilientSource<T>(id: string, run: () => Promise<T>, signal: AbortSignal,
  options: { now?: () => number; wait?: (ms: number, signal: AbortSignal) => Promise<unknown> } = {}): Promise<T> {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const state = circuits.get(id) ?? { failures: 0, openUntil: 0 };
  if (state.openUntil > now()) throw new Error("circuit_open 来源暂停，等待退避窗口结束");
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        signal.throwIfAborted();
        const result = await run();
        circuits.delete(id);
        return result;
      } catch (error) {
        const retryable = error instanceof HttpError && (error.status === 429 || error.status === 503);
        if (error instanceof HttpError && error.retryAfterMs > 0) state.openUntil = now() + error.retryAfterMs;
        if (!retryable || attempt >= 2) throw error;
        const ms = Math.max(500 * 2 ** attempt, error.retryAfterMs);
        if (ms > 5000) throw error; // defer to a future round rather than ignore a long Retry-After
        await wait(ms, signal);
      }
    }
  } catch (error) {
    state.failures += 1;
    if (state.failures >= 3) state.openUntil = Math.max(state.openUntil, now() + 10 * 60_000);
    circuits.set(id, state);
    throw error;
  }
}
