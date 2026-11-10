import type { BoardState } from "./types";
export function probeExitCode(board: BoardState): number {
  return board.sourceHealth.ok === 0 || board.sources.some((source) => source.quality?.structureAnomaly || source.diagnostic === "structure_anomaly") ? 1 : 0;
}
