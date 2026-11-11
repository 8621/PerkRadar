import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { transformSync } from "esbuild";

// tsx loads this package as CommonJS and transforms scripts with esbuild format "cjs".
// That transform rejects top-level await before the live probe can start.
describe("live-report", () => {
  it("transforms under the CommonJS output tsx uses for this package", () => {
    const filename = path.join(process.cwd(), "scripts", "live-report.ts");
    const source = fs.readFileSync(filename, "utf8");
    const result = transformSync(source, {
      loader: "ts",
      format: "cjs",
      sourcefile: filename,
      platform: "node",
    });
    assert.equal(result.warnings.length, 0);
    assert.match(result.code, /runRefresh/);
  });
});
