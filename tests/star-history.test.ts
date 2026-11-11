import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

const script = resolve("scripts/update-star-history.mjs");
const initial = "# SYNTHETIC\n\n<!-- star-history:start -->\nold image\n<!-- star-history:end -->\n\nKeep this paragraph.\n";
const svg = (count: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="533.333"><svg width="22" height="22"><path d="M0 0h10v10z"/></svg><text>${count}</text></svg>`;

/** 用临时目录运行公开 CLI，不接触项目 README 或真实图表。 */
function fixture(run: (root: string, chart: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "perkradar-star-test-"));
  const chart = join(root, "assets/star-history");
  mkdirSync(chart, { recursive: true });
  writeFileSync(join(root, "README.md"), initial);
  for (const theme of ["light", "dark"]) writeFileSync(join(chart, `star-history-${theme}.svg`), svg(10));
  try { run(root, chart); } finally { rmSync(root, { recursive: true, force: true }); }
}

/** 与工作流相同，以环境变量选择目录和仓库并执行命令。 */
function execute(root: string) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, STAR_HISTORY_ROOT: root, GITHUB_REPOSITORY: "synthetic/chart" },
  });
}

describe("Star History update CLI", () => {
  it("changes image versions when chart data changes and is stable on repeated execution", () => {
    fixture((root, chart) => {
      assert.equal(execute(root).status, 0);
      const first = readFileSync(join(root, "README.md"), "utf8");
      const light = readFileSync(join(chart, "star-history-light.svg"), "utf8");
      assert.match(first, /star-history-light\.svg\?v=[a-f0-9]{16}/);
      assert.doesNotMatch(first, /prefers-color-scheme|star-history-dark\.svg|<picture>/);
      assert.match(first, /synthetic\/chart Star history/);
      assert.ok(first.startsWith("# SYNTHETIC\n"));
      assert.ok(first.endsWith("Keep this paragraph.\n"));
      assert.match(light, /height="557\.333"/);
      assert.equal((light.match(/id="perkradar-chart-updated"/g) ?? []).length, 1);
      assert.ok(light.indexOf('id="perkradar-chart-updated"') > light.lastIndexOf("<text>10</text>"), "时间戳必须位于根 SVG，不能藏在头像的内部 SVG 中");
      assert.equal(execute(root).status, 0);
      assert.equal(readFileSync(join(root, "README.md"), "utf8"), first);
      assert.equal(readFileSync(join(chart, "star-history-light.svg"), "utf8"), light);
      writeFileSync(join(chart, "star-history-light.svg"), svg(11));
      assert.equal(execute(root).status, 0);
      assert.notEqual(readFileSync(join(root, "README.md"), "utf8"), first);
    });
  });

  it("does not rewrite either image or README when a rendered theme is invalid", () => {
    fixture((root, chart) => {
      writeFileSync(join(chart, "star-history-dark.svg"), "upstream error");
      assert.notEqual(execute(root).status, 0);
      assert.equal(readFileSync(join(root, "README.md"), "utf8"), initial);
      assert.equal(readFileSync(join(chart, "star-history-light.svg"), "utf8"), svg(10));
    });
  });

  it("refuses a missing README marker instead of replacing unrelated content", () => {
    fixture((root, chart) => {
      writeFileSync(join(root, "README.md"), "# Keep existing document\n");
      assert.notEqual(execute(root).status, 0);
      assert.equal(readFileSync(join(root, "README.md"), "utf8"), "# Keep existing document\n");
      assert.equal(readFileSync(join(chart, "star-history-light.svg"), "utf8"), svg(10));
    });
  });
});
