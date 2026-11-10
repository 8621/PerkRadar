import { BOARD_PAGE_SIZE } from "./config";
import type { BoardState } from "./types";
/** Never infer total from a client-side truncation. Invalid pagination is rejected. */
export function boardPage(board: BoardState, params: URLSearchParams): BoardState {
  const offset = Number(params.get("offset") ?? 0);
  const limit = Number(params.get("limit") ?? BOARD_PAGE_SIZE);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 2000) throw new Error("无效分页参数");
  return { ...board, deals: board.deals.slice(offset, offset + limit), pagination: { offset, limit, total: board.deals.length, hasMore: offset + limit < board.deals.length } };
}
