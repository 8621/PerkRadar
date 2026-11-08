import fs from "node:fs";
import path from "node:path";
import { REFRESH_INTERVAL_MS } from "./config";
import type { BoardState } from "./types";

export type DealSnapshotItem = {
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  category: string;
  publishedAt: string | null;
  publishedAtBeijing: string | null;
  expiresAt: string | null;
  expiresAtBeijing: string | null;
  isNew: boolean;
};

export type DealSnapshot = {
  schema: "daily-deals.snapshot.v1";
  note: string;
  fetchedAt: string;
  fetchedAtBeijing: string | null;
  freshUntil: string;
  roundStatus: BoardState["roundStatus"];
  sourceHealth: BoardState["sourceHealth"];
  activeCount: number;
  newCount: number;
  failures: BoardState["failures"];
  sources: {
    id: string;
    name: string;
    ok: boolean | null;
    fetched: number | null;
    inserted: number | null;
    error: string | null;
    finalUrl: string | null;
  }[];
  items: DealSnapshotItem[];
};

/** Where completed rounds are written. Tests and local runs can turn this off. */
export function snapshotDirectory(): string | null {
  const configured = process.env.DEALS_SNAPSHOT_DIR;
  if (configured === "off") return null;
  if (configured && configured.trim()) return configured;
  const store = "/cursor/stores/self";
  if (fs.existsSync(store)) return path.join(store, "deals");
  return null;
}

export function buildSnapshot(board: BoardState): DealSnapshot {
  const fetchedAtMs = board.lastUpdatedAt ?? board.generatedAt;
  return {
    schema: "daily-deals.snapshot.v1",
    note: "公开抓取快照，只含标题、原文链接、时间和来源成败。不含凭证、Cookie、请求头或正文。fetchedAt 过期后不能当作新一轮数据。",
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    fetchedAtBeijing: board.lastUpdatedLabel,
    freshUntil: new Date(fetchedAtMs + REFRESH_INTERVAL_MS).toISOString(),
    roundStatus: board.roundStatus,
    sourceHealth: board.sourceHealth,
    activeCount: board.activeCount,
    newCount: board.newCount,
    failures: board.failures,
    sources: board.sources.map((source) => ({
      id: source.id,
      name: source.name,
      ok: source.lastOk,
      fetched: source.lastFetched,
      inserted: source.lastInserted,
      error: source.lastError,
      finalUrl: source.lastFinalUrl,
    })),
    items: board.deals.map((deal) => ({
      title: deal.title,
      url: deal.url,
      sourceId: deal.sourceId,
      sourceName: deal.sourceName,
      category: deal.category,
      publishedAt: deal.publishedAt == null ? null : new Date(deal.publishedAt).toISOString(),
      publishedAtBeijing: deal.publishedLabel,
      expiresAt: deal.expiresAt == null ? null : new Date(deal.expiresAt).toISOString(),
      expiresAtBeijing: deal.expiresLabel,
      isNew: deal.isNew,
    })),
  };
}

function pruneRounds(dir: string): void {
  const entries = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const extra = entries.length - 90;
  for (let i = 0; i < extra; i += 1) {
    fs.rmSync(path.join(dir, entries[i]!), { force: true });
  }
}

/** Write the latest public snapshot. Returns the latest.json path, or null when disabled. */
export function writeDealSnapshot(board: BoardState, directory = snapshotDirectory()): string | null {
  if (!directory) return null;
  const snapshot = buildSnapshot(board);
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  fs.mkdirSync(directory, { recursive: true });
  const latest = path.join(directory, "latest.json");
  const temporary = path.join(directory, `.latest.${process.pid}.tmp`);
  fs.writeFileSync(temporary, body);
  fs.renameSync(temporary, latest);
  const rounds = path.join(directory, "rounds");
  fs.mkdirSync(rounds, { recursive: true });
  const stamp = snapshot.fetchedAt.replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(rounds, `${stamp}.json`), body);
  pruneRounds(rounds);
  return latest;
}
