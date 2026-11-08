import fs from "node:fs";
import path from "node:path";
import { runRefresh } from "../src/lib/refresh";

const board = await runRefresh({ trigger: "schedule" });
const summary = {
  note: "Live fetch summary. Titles and public URLs only; response bodies, cookies, and secrets are not stored.",
  generatedAt: new Date(board.generatedAt).toISOString(),
  lastUpdatedAt: board.lastUpdatedAt ? new Date(board.lastUpdatedAt).toISOString() : null,
  lastUpdatedLabelBeijing: board.lastUpdatedLabel,
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
    activeCount: source.activeCount,
    samples: board.deals
      .filter((deal) => deal.sourceId === source.id)
      .slice(0, 5)
      .map((deal) => ({
        title: deal.title,
        category: deal.category,
        url: deal.url,
        publishedLabelBeijing: deal.publishedLabel,
        expiresLabelBeijing: deal.expiresLabel,
        isNew: deal.isNew,
      })),
  })),
};

const target = path.join(process.cwd(), "reports", "live-fetch-summary.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      roundStatus: summary.roundStatus,
      sourceHealth: summary.sourceHealth,
      activeCount: summary.activeCount,
      newCount: summary.newCount,
      failures: summary.failures,
    },
    null,
    2,
  ),
);
