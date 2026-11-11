import fs from "node:fs";
import path from "node:path";
import { probeExitCode } from "../src/lib/probe-outcome";
import { runRefresh } from "../src/lib/refresh";

/** 抓取真实来源并写入报告；退出码沿用来源探测规则。 */
async function main(): Promise<void> {
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

  process.exitCode = probeExitCode(board);
  if (board.failures.length && !process.exitCode) console.warn("部分来源失败；请检查报告中的 warnings/failures");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
