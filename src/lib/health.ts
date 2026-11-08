import type { BoardState, FreshnessDTO } from "./types";

export type HealthReport = {
  ok: true;
  fetchedAt: string | null;
  fetchedAtBeijing: string | null;
  sourceHealth: BoardState["sourceHealth"];
  failures: BoardState["failures"];
  refreshInProgress: boolean;
  activeCount: number;
  newCount: number;
  nextRefreshAt: string | null;
  nextRefreshLabelBeijing: string | null;
  freshness: FreshnessDTO;
  anomalies: string[];
};

const NO_ROUND: FreshnessDTO = { lastRoundAgeMs: null, stale: false, severe: false };

/** Small status payload for Docker healthchecks. Deal titles stay on /api/deals. */
export function toHealthReport(board: BoardState): HealthReport {
  return {
    ok: true,
    fetchedAt: board.lastUpdatedAt == null ? null : new Date(board.lastUpdatedAt).toISOString(),
    fetchedAtBeijing: board.lastUpdatedLabel,
    sourceHealth: board.sourceHealth,
    failures: board.failures,
    refreshInProgress: board.refreshInProgress,
    activeCount: board.activeCount,
    newCount: board.newCount,
    nextRefreshAt: board.nextRefreshAt == null ? null : new Date(board.nextRefreshAt).toISOString(),
    nextRefreshLabelBeijing: board.nextRefreshLabel,
    freshness: board.freshness ?? NO_ROUND,
    anomalies: board.anomalies ?? [],
  };
}
